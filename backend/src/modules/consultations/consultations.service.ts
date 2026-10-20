import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConsultationStatus, PaymentStatus, Prisma, Role } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { RequestContext } from '../../common/decorators/request-context.decorator';
import { paginate } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditAction, AuditService } from '../audit-logs/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { allowedTransitions, canTransition } from './consultation-state';
import { CompleteConsultationDto, ListConsultationsQueryDto } from './dto/consultations.dto';
import { VideoProvider } from './video.provider';

export const consultationSelect = {
  id: true,
  status: true,
  mode: true,
  scheduledStartsAt: true,
  scheduledEndsAt: true,
  reasonForVisit: true,
  startedAt: true,
  endedAt: true,
  cancelledAt: true,
  cancelledById: true,
  cancellationReason: true,
  doctorNotes: true,
  videoSessionId: true,
  createdAt: true,
  updatedAt: true,
  patientId: true,
  doctorId: true,
  slotId: true,
  patient: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
  doctor: {
    select: {
      id: true,
      specialization: true,
      user: { select: { profile: { select: { firstName: true, lastName: true } } } },
    },
  },
  payment: { select: { id: true, status: true, amountMinor: true, currency: true, provider: true } },
  prescription: { select: { id: true } },
} satisfies Prisma.ConsultationSelect;

export type ConsultationView = Prisma.ConsultationGetPayload<{ select: typeof consultationSelect }>;

@Injectable()
export class ConsultationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly video: VideoProvider,
  ) {}

  /** Lists consultations the caller is allowed to see. Admins see everything. */
  async list(user: AuthUser, query: ListConsultationsQueryDto) {
    const where: Prisma.ConsultationWhereInput = {
      status: query.status,
      scheduledStartsAt:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    };
    if (user.role === Role.PATIENT) where.patientId = user.id;
    if (user.role === Role.DOCTOR) where.doctor = { userId: user.id };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.consultation.findMany({
        where,
        select: consultationSelect,
        orderBy: { scheduledStartsAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.consultation.count({ where }),
    ]);
    return paginate(items, total, query);
  }

  /** Object-level authorization: patient owner, doctor owner, or admin. */
  assertCanAccess(user: AuthUser, c: { patientId: string; doctorUserId: string }): void {
    if (user.role === Role.ADMIN) return;
    if (user.role === Role.PATIENT && c.patientId === user.id) return;
    if (user.role === Role.DOCTOR && c.doctorUserId === user.id) return;
    throw new ForbiddenException('You do not have access to this consultation');
  }

  async findOneForUser(user: AuthUser, id: string): Promise<ConsultationView> {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id },
      select: {
        ...consultationSelect,
        doctor: { select: { ...consultationSelect.doctor.select, userId: true } },
      },
    });
    if (!consultation) {
      throw new NotFoundException('Consultation not found');
    }
    this.assertCanAccess(user, {
      patientId: consultation.patientId,
      doctorUserId: consultation.doctor.userId,
    });
    const { doctor, ...rest } = consultation;
    const { userId: _userId, ...publicDoctor } = doctor;
    return { ...rest, doctor: publicDoctor };
  }

  /** Doctor starts the consultation: SCHEDULED -> IN_PROGRESS. Requires a successful payment. */
  async start(user: AuthUser, id: string, ctx: RequestContext) {
    const c = await this.requireDoctorOwned(user, id);
    this.assertTransition(c.status, ConsultationStatus.IN_PROGRESS);
    if (c.payment?.status !== PaymentStatus.SUCCEEDED) {
      throw new ConflictException('Consultation cannot start until payment has succeeded');
    }
    const session = await this.video.createSession(id);
    await this.transition(user, id, c.status, ConsultationStatus.IN_PROGRESS, ctx, {
      startedAt: new Date(),
      videoSessionId: session.sessionId,
    });
    const updated = await this.findOneForUser(user, id);
    // Emails the patient the join link. Delivered asynchronously by the notification worker.
    await this.notifications.enqueue({
      type: 'consultation.started',
      recipientId: c.patientId,
      payload: {
        consultationId: id,
        joinUrl: session.joinUrl,
        mode: updated.mode,
        doctorName: doctorDisplayName(updated.doctor),
        patientFirstName: updated.patient.profile?.firstName ?? null,
        scheduledStartsAt: updated.scheduledStartsAt.toISOString(),
      },
    });
    return { ...updated, video: session };
  }

  /** Join details for the live session. Available to both participants while IN_PROGRESS. */
  async session(user: AuthUser, id: string) {
    const c = await this.findOneForUser(user, id);
    if (c.status !== ConsultationStatus.IN_PROGRESS || !c.videoSessionId) {
      throw new ConflictException('This consultation is not in progress, so there is no session to join');
    }
    const session = this.video.getSession(id, c.videoSessionId);
    return { ...session, mode: c.mode, startedAt: c.startedAt };
  }

  /** Doctor completes the consultation: IN_PROGRESS -> COMPLETED. */
  async complete(user: AuthUser, id: string, dto: CompleteConsultationDto, ctx: RequestContext) {
    const c = await this.requireDoctorOwned(user, id);
    this.assertTransition(c.status, ConsultationStatus.COMPLETED);
    if (c.videoSessionId) {
      await this.video.endSession(c.videoSessionId);
    }
    await this.transition(user, id, c.status, ConsultationStatus.COMPLETED, ctx, {
      endedAt: new Date(),
      doctorNotes: dto.doctorNotes,
    });
    await this.notifications.enqueue({
      type: 'consultation.completed',
      recipientId: c.patientId,
      payload: { consultationId: id },
    });
    return this.findOneForUser(user, id);
  }

  /** Doctor marks a missed appointment: SCHEDULED -> NO_SHOW, only after the scheduled start. */
  async markNoShow(user: AuthUser, id: string, ctx: RequestContext) {
    const c = await this.requireDoctorOwned(user, id);
    this.assertTransition(c.status, ConsultationStatus.NO_SHOW);
    if (c.scheduledStartsAt > new Date()) {
      throw new ConflictException('Cannot mark no-show before the scheduled start time');
    }
    await this.transition(user, id, c.status, ConsultationStatus.NO_SHOW, ctx, { endedAt: new Date() });
    return this.findOneForUser(user, id);
  }

  /** Shared validation used by BookingsService.cancel as well. */
  assertTransition(from: ConsultationStatus, to: ConsultationStatus): void {
    if (!canTransition(from, to)) {
      const allowed = allowedTransitions(from);
      throw new ConflictException(
        `Cannot move consultation from ${from} to ${to}. ${allowed.length ? `Allowed: ${allowed.join(', ')}` : 'This is a terminal state.'}`,
      );
    }
  }

  /**
   * Conditional update: the WHERE clause re-checks the current status so two
   * concurrent transitions cannot both succeed. The audit row commits with it.
   */
  private async transition(
    user: AuthUser,
    id: string,
    from: ConsultationStatus,
    to: ConsultationStatus,
    ctx: RequestContext,
    extra: Prisma.ConsultationUpdateManyMutationInput,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.consultation.updateMany({
        where: { id, status: from },
        data: { status: to, ...extra },
      });
      if (result.count === 0) {
        throw new ConflictException('Consultation status changed concurrently; please reload');
      }
      await this.audit.record(
        {
          action: AuditAction.CONSULTATION_STATUS_CHANGED,
          entityType: 'Consultation',
          entityId: id,
          actorId: user.id,
          actorRole: user.role,
          metadata: { from, to },
          context: ctx,
        },
        tx,
      );
    });
  }

  private async requireDoctorOwned(user: AuthUser, id: string) {
    const c = await this.prisma.consultation.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        patientId: true,
        scheduledStartsAt: true,
        videoSessionId: true,
        doctor: { select: { userId: true } },
        payment: { select: { status: true } },
      },
    });
    if (!c) {
      throw new NotFoundException('Consultation not found');
    }
    if (user.role !== Role.DOCTOR || c.doctor.userId !== user.id) {
      throw new ForbiddenException('Only the consulting doctor can perform this action');
    }
    return c;
  }
}

function doctorDisplayName(doctor: ConsultationView['doctor']): string {
  const p = doctor.user.profile;
  const name = [p?.firstName, p?.lastName].filter(Boolean).join(' ');
  return name ? `Dr. ${name}` : 'Your doctor';
}
