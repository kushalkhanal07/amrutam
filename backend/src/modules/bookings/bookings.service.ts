import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConsultationStatus, DoctorVerificationStatus, PaymentStatus, SlotStatus } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { RequestContext } from '../../common/decorators/request-context.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditAction, AuditService } from '../audit-logs/audit.service';
import { ConsultationsService, consultationSelect } from '../consultations/consultations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { CancelBookingDto, CreateBookingDto } from './dto/bookings.dto';

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly consultations: ConsultationsService,
    private readonly payments: PaymentsService,
  ) {}

  /**
   * Books a slot. Concurrency control is a conditional UPDATE inside one
   * transaction: `UPDATE availability_slots SET status='BOOKED' WHERE id=? AND
   * status='AVAILABLE'`. PostgreSQL row locking serialises competing writers;
   * the loser re-evaluates the WHERE clause after the winner commits, matches
   * zero rows, and we roll back with 409. `Consultation.slotId` is also UNIQUE,
   * so even a bug in this code could not double-book at the database level.
   */
  async create(patient: AuthUser, dto: CreateBookingDto, ctx: RequestContext) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id: dto.doctorId },
      select: {
        id: true,
        userId: true,
        consultationFeeMinor: true,
        currency: true,
        verificationStatus: true,
        user: { select: { status: true } },
      },
    });
    if (
      !doctor ||
      doctor.verificationStatus !== DoctorVerificationStatus.VERIFIED ||
      doctor.user.status !== 'ACTIVE'
    ) {
      throw new NotFoundException('Doctor not found or not accepting bookings');
    }
    if (doctor.userId === patient.id) {
      throw new BadRequestException('You cannot book a consultation with yourself');
    }
    const slot = await this.prisma.availabilitySlot.findUnique({ where: { id: dto.slotId } });
    if (!slot || slot.doctorId !== doctor.id) {
      throw new NotFoundException('Slot not found for this doctor');
    }
    if (slot.startsAt <= new Date()) {
      throw new BadRequestException('Slot is in the past');
    }
    // Pre-check for a friendly error; the transaction below is the real guard.
    if (slot.status !== SlotStatus.AVAILABLE) {
      throw new ConflictException('Slot is no longer available');
    }

    const consultationId = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.availabilitySlot.updateMany({
        where: { id: slot.id, status: SlotStatus.AVAILABLE },
        data: { status: SlotStatus.BOOKED },
      });
      if (claimed.count === 0) {
        throw new ConflictException('Slot is no longer available');
      }

      const consultation = await tx.consultation.create({
        data: {
          patientId: patient.id,
          doctorId: doctor.id,
          slotId: slot.id,
          mode: dto.mode,
          reasonForVisit: dto.reasonForVisit,
          scheduledStartsAt: slot.startsAt,
          scheduledEndsAt: slot.endsAt,
          payment: {
            create: {
              patientId: patient.id,
              amountMinor: doctor.consultationFeeMinor,
              currency: doctor.currency,
              status: PaymentStatus.PENDING,
              provider: this.payments.providerName,
            },
          },
        },
        select: { id: true },
      });

      await this.audit.record(
        {
          action: AuditAction.BOOKING_CREATED,
          entityType: 'Consultation',
          entityId: consultation.id,
          actorId: patient.id,
          actorRole: patient.role,
          metadata: { doctorId: doctor.id, slotId: slot.id, startsAt: slot.startsAt.toISOString() },
          context: ctx,
        },
        tx,
      );
      await this.notifications.enqueue(
        {
          type: 'booking.confirmed',
          recipientId: patient.id,
          payload: { consultationId: consultation.id, startsAt: slot.startsAt.toISOString() },
        },
        tx,
      );
      await this.notifications.enqueue(
        {
          type: 'booking.confirmed',
          recipientId: doctor.userId,
          payload: { consultationId: consultation.id, startsAt: slot.startsAt.toISOString() },
        },
        tx,
      );
      return consultation.id;
    });

    return this.prisma.consultation.findUniqueOrThrow({
      where: { id: consultationId },
      select: consultationSelect,
    });
  }

  /** Cancels a SCHEDULED consultation, releases the slot, then refunds/voids the payment. */
  async cancel(user: AuthUser, consultationId: string, dto: CancelBookingDto, ctx: RequestContext) {
    const c = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
      select: {
        id: true,
        status: true,
        patientId: true,
        slotId: true,
        scheduledStartsAt: true,
        doctor: { select: { userId: true } },
      },
    });
    if (!c) {
      throw new NotFoundException('Consultation not found');
    }
    this.consultations.assertCanAccess(user, { patientId: c.patientId, doctorUserId: c.doctor.userId });
    this.consultations.assertTransition(c.status, ConsultationStatus.CANCELLED);

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.consultation.updateMany({
        where: { id: c.id, status: ConsultationStatus.SCHEDULED },
        data: {
          status: ConsultationStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledById: user.id,
          cancellationReason: dto.reason,
        },
      });
      if (updated.count === 0) {
        throw new ConflictException('Consultation status changed concurrently; please reload');
      }
      // Release the slot only if it is still in the future; a past slot stays consumed.
      if (c.scheduledStartsAt > new Date()) {
        await tx.availabilitySlot.update({ where: { id: c.slotId }, data: { status: SlotStatus.AVAILABLE } });
      }
      await this.audit.record(
        {
          action: AuditAction.BOOKING_CANCELLED,
          entityType: 'Consultation',
          entityId: c.id,
          actorId: user.id,
          actorRole: user.role,
          metadata: { previousStatus: c.status, slotId: c.slotId },
          context: ctx,
        },
        tx,
      );
      const recipients = [c.patientId, c.doctor.userId].filter((id) => id !== user.id);
      for (const recipientId of recipients) {
        await this.notifications.enqueue(
          { type: 'booking.cancelled', recipientId, payload: { consultationId: c.id } },
          tx,
        );
      }
    });

    // External side effect after commit; never inside the transaction.
    await this.payments.onConsultationCancelled(c.id);

    return this.consultations.findOneForUser(user, c.id);
  }
}
