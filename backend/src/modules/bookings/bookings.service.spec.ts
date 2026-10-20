import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { BookingsService } from './bookings.service';

/**
 * Unit tests cover validation and the transactional flow with a mocked
 * database. Real concurrency is covered by test/booking.e2e-spec.ts against
 * PostgreSQL.
 */
describe('BookingsService.create', () => {
  const tx = {
    availabilitySlot: { updateMany: jest.fn(), update: jest.fn() },
    consultation: { create: jest.fn(), updateMany: jest.fn() },
  };
  const prisma = {
    doctor: { findUnique: jest.fn() },
    availabilitySlot: { findUnique: jest.fn() },
    consultation: { findUniqueOrThrow: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn((fn: (t: unknown) => Promise<unknown>) => fn(tx)),
  };
  const audit = { record: jest.fn() };
  const notifications = { enqueue: jest.fn() };
  const consultations = {
    assertCanAccess: jest.fn(),
    assertTransition: jest.fn(),
    findOneForUser: jest.fn(),
  };
  const payments = { providerName: 'MOCK', onConsultationCancelled: jest.fn() };

  const service = new BookingsService(
    prisma as never,
    audit as never,
    notifications as never,
    consultations as never,
    payments as never,
  );

  const patient = { id: 'p1', email: 'p@x.y', role: Role.PATIENT };
  const doctor = {
    id: 'd1',
    userId: 'du1',
    consultationFeeMinor: 50000,
    currency: 'INR',
    verificationStatus: 'VERIFIED',
    user: { status: 'ACTIVE' },
  };
  const future = new Date(Date.now() + 3_600_000);
  const slot = {
    id: 's1',
    doctorId: 'd1',
    status: 'AVAILABLE',
    startsAt: future,
    endsAt: new Date(future.getTime() + 1_800_000),
  };
  const dto = { doctorId: 'd1', slotId: 's1' };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.doctor.findUnique.mockResolvedValue(doctor);
    prisma.availabilitySlot.findUnique.mockResolvedValue(slot);
    tx.availabilitySlot.updateMany.mockResolvedValue({ count: 1 });
    tx.consultation.create.mockResolvedValue({ id: 'c1' });
    prisma.consultation.findUniqueOrThrow.mockResolvedValue({ id: 'c1', status: 'SCHEDULED' });
  });

  it('rejects unverified doctors', async () => {
    prisma.doctor.findUnique.mockResolvedValue({ ...doctor, verificationStatus: 'PENDING' });
    await expect(service.create(patient, dto, {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects slots that belong to another doctor', async () => {
    prisma.availabilitySlot.findUnique.mockResolvedValue({ ...slot, doctorId: 'other' });
    await expect(service.create(patient, dto, {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects past slots', async () => {
    prisma.availabilitySlot.findUnique.mockResolvedValue({ ...slot, startsAt: new Date(Date.now() - 1000) });
    await expect(service.create(patient, dto, {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects booking yourself', async () => {
    await expect(service.create({ ...patient, id: 'du1' }, dto, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('fails with 409 when the conditional slot update matches no rows (lost the race)', async () => {
    tx.availabilitySlot.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.create(patient, dto, {})).rejects.toBeInstanceOf(ConflictException);
    expect(tx.consultation.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('claims the slot with a conditional update and writes consultation, payment, audit and notifications in the transaction', async () => {
    const result = await service.create(patient, { ...dto, reasonForVisit: 'headache' }, { requestId: 'r1' });

    expect(tx.availabilitySlot.updateMany).toHaveBeenCalledWith({
      where: { id: 's1', status: 'AVAILABLE' },
      data: { status: 'BOOKED' },
    });
    expect(tx.consultation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          patientId: 'p1',
          doctorId: 'd1',
          slotId: 's1',
          payment: {
            create: expect.objectContaining({
              amountMinor: 50000,
              currency: 'INR',
              status: 'PENDING',
              provider: 'MOCK',
            }),
          },
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'booking.created', entityId: 'c1', actorId: 'p1' }),
      tx,
    );
    expect(notifications.enqueue).toHaveBeenCalledTimes(2);
    expect(notifications.enqueue).toHaveBeenCalledWith(expect.objectContaining({ recipientId: 'du1' }), tx);
    expect(result).toEqual({ id: 'c1', status: 'SCHEDULED' });
  });
});

describe('BookingsService.cancel', () => {
  const tx = { consultation: { updateMany: jest.fn() }, availabilitySlot: { update: jest.fn() } };
  const prisma = {
    consultation: { findUnique: jest.fn() },
    $transaction: jest.fn((fn: (t: unknown) => Promise<unknown>) => fn(tx)),
  };
  const audit = { record: jest.fn() };
  const notifications = { enqueue: jest.fn() };
  const consultations = {
    assertCanAccess: jest.fn(),
    assertTransition: jest.fn(),
    findOneForUser: jest.fn().mockResolvedValue({ id: 'c1', status: 'CANCELLED' }),
  };
  const payments = { providerName: 'MOCK', onConsultationCancelled: jest.fn() };
  const service = new BookingsService(
    prisma as never,
    audit as never,
    notifications as never,
    consultations as never,
    payments as never,
  );
  const patient = { id: 'p1', email: 'p@x.y', role: Role.PATIENT };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.consultation.findUnique.mockResolvedValue({
      id: 'c1',
      status: 'SCHEDULED',
      patientId: 'p1',
      slotId: 's1',
      scheduledStartsAt: new Date(Date.now() + 3_600_000),
      doctor: { userId: 'du1' },
    });
    tx.consultation.updateMany.mockResolvedValue({ count: 1 });
  });

  it('cancels, releases the slot, audits, notifies the other party and triggers the refund after commit', async () => {
    await service.cancel(patient, 'c1', { reason: 'busy' }, {});
    expect(consultations.assertCanAccess).toHaveBeenCalledWith(patient, {
      patientId: 'p1',
      doctorUserId: 'du1',
    });
    expect(consultations.assertTransition).toHaveBeenCalledWith('SCHEDULED', 'CANCELLED');
    expect(tx.consultation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c1', status: 'SCHEDULED' } }),
    );
    expect(tx.availabilitySlot.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { status: 'AVAILABLE' },
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'booking.cancelled' }), tx);
    expect(notifications.enqueue).toHaveBeenCalledTimes(1);
    expect(notifications.enqueue).toHaveBeenCalledWith(expect.objectContaining({ recipientId: 'du1' }), tx);
    expect(payments.onConsultationCancelled).toHaveBeenCalledWith('c1');
  });

  it('fails with 409 if the status changed concurrently', async () => {
    tx.consultation.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.cancel(patient, 'c1', {}, {})).rejects.toBeInstanceOf(ConflictException);
    expect(payments.onConsultationCancelled).not.toHaveBeenCalled();
  });
});
