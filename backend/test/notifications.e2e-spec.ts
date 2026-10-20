import { NotificationStatus } from '@prisma/client';
import { NotificationSender } from '../src/modules/notifications/notification-sender';
import { NotificationWorker } from '../src/modules/notifications/notification.worker';
import {
  TestContext,
  book,
  createSlot,
  createTestApp,
  createVerifiedDoctor,
  registerUser,
  resetDatabase,
} from './helpers';

describe('asynchronous notification jobs (e2e)', () => {
  let ctx: TestContext;
  let worker: NotificationWorker;
  let sender: NotificationSender;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    worker = ctx.app.get(NotificationWorker);
    sender = ctx.app.get(NotificationSender);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('jobs are written in the booking transaction and delivered by the worker outside the request', async () => {
    const doctor = await createVerifiedDoctor(ctx);
    const patient = await registerUser(ctx);
    const slot = await createSlot(ctx, doctor.doctorId);
    const created = await book(ctx, patient, doctor.doctorId, slot.id).expect(201);

    const pending = await ctx.prisma.notificationJob.findMany({
      where: { payload: { path: ['consultationId'], equals: created.body.id } },
    });
    expect(pending).toHaveLength(2);
    expect(pending.every((j) => j.status === NotificationStatus.PENDING)).toBe(true);

    const sendSpy = jest.spyOn(sender, 'send');
    const processed = await worker.tick();
    expect(processed).toBe(2);
    expect(sendSpy).toHaveBeenCalledTimes(2);

    const sent = await ctx.prisma.notificationJob.findMany({
      where: { id: { in: pending.map((j) => j.id) } },
    });
    expect(
      sent.every((j) => j.status === NotificationStatus.SENT && j.sentAt !== null && j.attempts === 1),
    ).toBe(true);
    sendSpy.mockRestore();
  });

  it('failed deliveries are retried with backoff and marked FAILED after maxAttempts', async () => {
    const patient = await registerUser(ctx);
    const job = await ctx.prisma.notificationJob.create({
      data: {
        type: 'booking.confirmed',
        recipientId: patient.id,
        payload: { consultationId: 'x' },
        maxAttempts: 2,
      },
    });
    const sendSpy = jest.spyOn(sender, 'send').mockRejectedValue(new Error('SMTP down'));

    await worker.tick();
    let stored = await ctx.prisma.notificationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored).toMatchObject({ status: NotificationStatus.PENDING, attempts: 1, lastError: 'SMTP down' });
    expect(stored.nextRunAt.getTime()).toBeGreaterThan(Date.now() - 1000);

    // Force the retry to be due now, then exhaust the attempts.
    await ctx.prisma.notificationJob.update({
      where: { id: job.id },
      data: { nextRunAt: new Date(Date.now() - 1000) },
    });
    await worker.tick();
    stored = await ctx.prisma.notificationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored).toMatchObject({ status: NotificationStatus.FAILED, attempts: 2 });

    sendSpy.mockRestore();
    // A FAILED job is never picked up again.
    expect(await worker.tick()).toBe(0);
  });

  it('the sweep removes expired idempotency records', async () => {
    const patient = await registerUser(ctx);
    await ctx.prisma.idempotencyRecord.create({
      data: {
        userId: patient.id,
        key: 'old',
        requestHash: 'h',
        expiresAt: new Date(Date.now() - 1000),
        completedAt: new Date(),
      },
    });
    // tick() sweeps every 12th tick starting with the first; a fresh ticks counter is private, so drive it enough times.
    for (let i = 0; i < 12; i += 1) await worker.tick();
    expect(await ctx.prisma.idempotencyRecord.count({ where: { userId: patient.id, key: 'old' } })).toBe(0);
  });
});
