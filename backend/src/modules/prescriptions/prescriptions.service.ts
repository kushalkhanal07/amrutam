import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConsultationStatus, Prisma, Role } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { RequestContext } from '../../common/decorators/request-context.decorator';
import { PaginationQueryDto, paginate } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditAction, AuditService } from '../audit-logs/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreatePrescriptionDto } from './dto/prescriptions.dto';

const prescriptionSelect = {
  id: true,
  consultationId: true,
  doctorId: true,
  patientId: true,
  diagnosis: true,
  instructions: true,
  issuedAt: true,
  validUntil: true,
  createdAt: true,
  items: {
    select: {
      id: true,
      medicationName: true,
      dosage: true,
      frequency: true,
      durationDays: true,
      notes: true,
    },
  },
  doctor: {
    select: {
      specialization: true,
      userId: true,
      user: { select: { profile: { select: { firstName: true, lastName: true } } } },
    },
  },
} satisfies Prisma.PrescriptionSelect;

/** Prescriptions may be written while the consultation is live or just after it. */
const PRESCRIBABLE_STATUSES: ConsultationStatus[] = [
  ConsultationStatus.IN_PROGRESS,
  ConsultationStatus.COMPLETED,
];

@Injectable()
export class PrescriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(user: AuthUser, dto: CreatePrescriptionDto, ctx: RequestContext) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: dto.consultationId },
      select: {
        id: true,
        status: true,
        patientId: true,
        doctorId: true,
        doctor: { select: { userId: true } },
        prescription: { select: { id: true } },
      },
    });
    if (!consultation) {
      throw new NotFoundException('Consultation not found');
    }
    if (user.role !== Role.DOCTOR || consultation.doctor.userId !== user.id) {
      throw new ForbiddenException('Only the consulting doctor can issue a prescription');
    }
    if (!PRESCRIBABLE_STATUSES.includes(consultation.status)) {
      throw new ConflictException(
        `Prescriptions can only be issued for IN_PROGRESS or COMPLETED consultations (current: ${consultation.status})`,
      );
    }
    if (consultation.prescription) {
      throw new ConflictException('A prescription already exists for this consultation');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const prescription = await tx.prescription.create({
        data: {
          consultationId: consultation.id,
          doctorId: consultation.doctorId,
          patientId: consultation.patientId,
          diagnosis: dto.diagnosis,
          instructions: dto.instructions,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
          items: { create: dto.items },
        },
        select: prescriptionSelect,
      });
      // Audit metadata carries counts and ids only: never diagnosis or medication names.
      await this.audit.record(
        {
          action: AuditAction.PRESCRIPTION_CREATED,
          entityType: 'Prescription',
          entityId: prescription.id,
          actorId: user.id,
          actorRole: user.role,
          metadata: { consultationId: consultation.id, itemCount: dto.items.length },
          context: ctx,
        },
        tx,
      );
      await this.notifications.enqueue(
        {
          type: 'prescription.issued',
          recipientId: consultation.patientId,
          payload: { prescriptionId: prescription.id, consultationId: consultation.id },
        },
        tx,
      );
      return prescription;
    });
    return this.strip(created);
  }

  async findOne(user: AuthUser, id: string) {
    const p = await this.prisma.prescription.findUnique({ where: { id }, select: prescriptionSelect });
    if (!p) {
      throw new NotFoundException('Prescription not found');
    }
    this.assertCanView(user, p);
    return this.strip(p);
  }

  async findByConsultation(user: AuthUser, consultationId: string) {
    const p = await this.prisma.prescription.findUnique({
      where: { consultationId },
      select: prescriptionSelect,
    });
    if (!p) {
      throw new NotFoundException('No prescription for this consultation');
    }
    this.assertCanView(user, p);
    return this.strip(p);
  }

  async listMine(user: AuthUser, query: PaginationQueryDto) {
    const where: Prisma.PrescriptionWhereInput =
      user.role === Role.PATIENT
        ? { patientId: user.id }
        : user.role === Role.DOCTOR
          ? { doctor: { userId: user.id } }
          : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.prescription.findMany({
        where,
        select: prescriptionSelect,
        orderBy: { issuedAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.prescription.count({ where }),
    ]);
    return paginate(
      items.map((p) => this.strip(p)),
      total,
      query,
    );
  }

  private assertCanView(user: AuthUser, p: { patientId: string; doctor: { userId: string } }) {
    if (user.role === Role.ADMIN) return;
    if (user.role === Role.PATIENT && p.patientId === user.id) return;
    if (user.role === Role.DOCTOR && p.doctor.userId === user.id) return;
    throw new ForbiddenException('You do not have access to this prescription');
  }

  /** Removes the internal doctor userId used for the ownership check. */
  private strip<T extends { doctor: { userId: string } & Record<string, unknown> }>(p: T) {
    const { userId: _userId, ...doctor } = p.doctor;
    return { ...p, doctor };
  }
}
