import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrescriptionsService } from './prescriptions.service';

describe('PrescriptionsService access control', () => {
  const prisma = {
    consultation: { findUnique: jest.fn() },
    prescription: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const audit = { record: jest.fn() };
  const notifications = { enqueue: jest.fn() };
  const service = new PrescriptionsService(prisma as never, audit as never, notifications as never);

  const doctorUser = { id: 'du1', email: 'd@x.y', role: Role.DOCTOR };
  const otherDoctor = { id: 'du2', email: 'd2@x.y', role: Role.DOCTOR };
  const patient = { id: 'p1', email: 'p@x.y', role: Role.PATIENT };
  const otherPatient = { id: 'p2', email: 'p2@x.y', role: Role.PATIENT };
  const admin = { id: 'a1', email: 'a@x.y', role: Role.ADMIN };
  const dto = {
    consultationId: 'c1',
    diagnosis: 'x',
    items: [{ medicationName: 'm', dosage: '1', frequency: 'daily', durationDays: 3 }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.consultation.findUnique.mockResolvedValue({
      id: 'c1',
      status: 'IN_PROGRESS',
      patientId: 'p1',
      doctorId: 'd1',
      doctor: { userId: 'du1' },
      prescription: null,
    });
    prisma.prescription.findUnique.mockResolvedValue({
      id: 'rx1',
      patientId: 'p1',
      doctor: { userId: 'du1', specialization: 'x', user: {} },
      items: [],
    });
  });

  it('only the consulting doctor can create', async () => {
    await expect(service.create(otherDoctor, dto, {})).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.create(patient, dto, {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('cannot prescribe for a SCHEDULED or CANCELLED consultation', async () => {
    prisma.consultation.findUnique.mockResolvedValue({
      id: 'c1',
      status: 'SCHEDULED',
      patientId: 'p1',
      doctorId: 'd1',
      doctor: { userId: 'du1' },
      prescription: null,
    });
    await expect(service.create(doctorUser, dto, {})).rejects.toBeInstanceOf(ConflictException);
  });

  it('cannot create a second prescription for the same consultation', async () => {
    prisma.consultation.findUnique.mockResolvedValue({
      id: 'c1',
      status: 'COMPLETED',
      patientId: 'p1',
      doctorId: 'd1',
      doctor: { userId: 'du1' },
      prescription: { id: 'rx1' },
    });
    await expect(service.create(doctorUser, dto, {})).rejects.toBeInstanceOf(ConflictException);
  });

  it('audit metadata never contains clinical content', async () => {
    const tx = {
      prescription: { create: jest.fn().mockResolvedValue({ id: 'rx1', doctor: { userId: 'du1' } }) },
    };
    prisma.$transaction.mockImplementation((fn: (t: unknown) => Promise<unknown>) => fn(tx));
    await service.create(doctorUser, { ...dto, diagnosis: 'SENSITIVE-DIAGNOSIS' }, {});
    const event = audit.record.mock.calls[0][0] as { metadata: Record<string, unknown> };
    expect(JSON.stringify(event.metadata)).not.toContain('SENSITIVE');
    expect(event.metadata).toEqual({ consultationId: 'c1', itemCount: 1 });
  });

  it('patient owner, issuing doctor and admin can view; others cannot', async () => {
    await expect(service.findOne(patient, 'rx1')).resolves.toMatchObject({ id: 'rx1' });
    await expect(service.findOne(doctorUser, 'rx1')).resolves.toMatchObject({ id: 'rx1' });
    await expect(service.findOne(admin, 'rx1')).resolves.toMatchObject({ id: 'rx1' });
    await expect(service.findOne(otherPatient, 'rx1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.findOne(otherDoctor, 'rx1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('strips the internal doctor userId from responses', async () => {
    const result = await service.findOne(admin, 'rx1');
    expect((result.doctor as Record<string, unknown>).userId).toBeUndefined();
  });
});
