import { Role, SlotStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  TestContext,
  TestDoctor,
  TestUser,
  auth,
  book,
  createAdmin,
  createSlot,
  createTestApp,
  createVerifiedDoctor,
  registerUser,
  resetDatabase,
} from './helpers';

describe('bookings (e2e)', () => {
  let ctx: TestContext;
  let doctor: TestDoctor;
  let patient: TestUser;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    doctor = await createVerifiedDoctor(ctx);
    patient = await registerUser(ctx);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('happy path', () => {
    it('books an available slot: consultation SCHEDULED, payment PENDING, slot BOOKED, audit + outbox written atomically', async () => {
      const slot = await createSlot(ctx, doctor.doctorId);
      const res = await book(ctx, patient, doctor.doctorId, slot.id).expect(201);

      expect(res.body).toMatchObject({
        status: 'SCHEDULED',
        slotId: slot.id,
        doctorId: doctor.doctorId,
        patientId: patient.id,
      });
      expect(res.body.payment).toMatchObject({
        status: 'PENDING',
        amountMinor: 50000,
        currency: 'INR',
        provider: 'MOCK',
      });
      expect(res.body.doctor.user.profile.firstName).toBeDefined();
      expect(res.body.doctor.user.email).toBeUndefined(); // doctor's account details are not leaked

      const stored = await ctx.prisma.availabilitySlot.findUniqueOrThrow({ where: { id: slot.id } });
      expect(stored.status).toBe(SlotStatus.BOOKED);

      const audit = await ctx.prisma.auditLog.findFirst({
        where: { action: 'booking.created', entityId: res.body.id },
      });
      expect(audit).toMatchObject({ actorId: patient.id, actorRole: 'PATIENT', entityType: 'Consultation' });

      const jobs = await ctx.prisma.notificationJob.findMany({
        where: { type: 'booking.confirmed', payload: { path: ['consultationId'], equals: res.body.id } },
      });
      expect(jobs.map((j) => j.recipientId).sort()).toEqual([patient.id, doctor.id].sort());
    });

    it('the slot disappears from the public availability list once booked', async () => {
      const slot = await createSlot(ctx, doctor.doctorId, 120);
      const before = await ctx.http().get(`/doctors/${doctor.doctorId}/availability`).expect(200);
      expect(before.body.map((s: { id: string }) => s.id)).toContain(slot.id);
      await book(ctx, patient, doctor.doctorId, slot.id).expect(201);
      const after = await ctx.http().get(`/doctors/${doctor.doctorId}/availability`).expect(200);
      expect(after.body.map((s: { id: string }) => s.id)).not.toContain(slot.id);
    });
  });

  describe('validation and authorization', () => {
    it('requires an Idempotency-Key', async () => {
      const slot = await createSlot(ctx, doctor.doctorId, 180);
      const res = await ctx
        .http()
        .post('/bookings')
        .set(auth(patient))
        .send({ doctorId: doctor.doctorId, slotId: slot.id })
        .expect(400);
      expect(res.body.message).toMatch(/Idempotency-Key/);
    });

    it('rejects malformed ids and unknown fields', async () => {
      const res = await ctx
        .http()
        .post('/bookings')
        .set(auth(patient))
        .set('Idempotency-Key', randomUUID())
        .send({ doctorId: 'x', slotId: 'y', patientId: 'spoof' })
        .expect(400);
      expect(res.body.message.join(' ')).toMatch(/doctorId/);
      expect(res.body.message.join(' ')).toMatch(/patientId/);
    });

    it('doctors and admins cannot book', async () => {
      const slot = await createSlot(ctx, doctor.doctorId, 200);
      await book(ctx, doctor, doctor.doctorId, slot.id).expect(403);
      const admin = await createAdmin(ctx);
      await book(ctx, admin, doctor.doctorId, slot.id).expect(403);
    });

    it('cannot book an unverified doctor or a past/blocked slot', async () => {
      const pending = await registerUser(ctx, Role.DOCTOR);
      const profile = await ctx
        .http()
        .post('/doctors/me')
        .set(auth(pending))
        .send({ specialization: 'Xray', consultationFeeMinor: 100 })
        .expect(201);
      const slot = await createSlot(ctx, profile.body.id, 60);
      await book(ctx, patient, profile.body.id, slot.id).expect(404);

      const blocked = await createSlot(ctx, doctor.doctorId, 240, 30, SlotStatus.BLOCKED);
      await book(ctx, patient, doctor.doctorId, blocked.id).expect(409);

      const past = await ctx.prisma.availabilitySlot.create({
        data: {
          doctorId: doctor.doctorId,
          startsAt: new Date(Date.now() - 7_200_000),
          endsAt: new Date(Date.now() - 5_400_000),
        },
      });
      await book(ctx, patient, doctor.doctorId, past.id).expect(400);
    });
  });

  describe('double booking protection', () => {
    it('a second sequential booking of the same slot fails with 409', async () => {
      const slot = await createSlot(ctx, doctor.doctorId, 300);
      await book(ctx, patient, doctor.doctorId, slot.id).expect(201);
      const other = await registerUser(ctx);
      const res = await book(ctx, other, doctor.doctorId, slot.id).expect(409);
      expect(res.body.message).toBe('Slot is no longer available');
    });

    it('CONCURRENCY: 12 patients race for one slot and exactly one wins', async () => {
      const slot = await createSlot(ctx, doctor.doctorId, 360);
      const patients = await Promise.all(Array.from({ length: 12 }, () => registerUser(ctx)));

      const results = await Promise.all(patients.map((p) => book(ctx, p, doctor.doctorId, slot.id)));
      const statuses = results.map((r) => r.status).sort();

      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
      expect(statuses.filter((s) => s === 409)).toHaveLength(11);

      const consultations = await ctx.prisma.consultation.findMany({ where: { slotId: slot.id } });
      expect(consultations).toHaveLength(1);
      const stored = await ctx.prisma.availabilitySlot.findUniqueOrThrow({ where: { id: slot.id } });
      expect(stored.status).toBe(SlotStatus.BOOKED);

      // Exactly one audit event and no orphaned payments from the losers (transaction rolled back).
      expect(
        await ctx.prisma.auditLog.count({
          where: { action: 'booking.created', entityId: consultations[0].id },
        }),
      ).toBe(1);
      expect(await ctx.prisma.payment.count({ where: { consultationId: consultations[0].id } })).toBe(1);
    });

    it('the database itself rejects a second active consultation on a slot even if application checks were bypassed', async () => {
      const slot = await createSlot(ctx, doctor.doctorId, 400);
      const first = await book(ctx, patient, doctor.doctorId, slot.id).expect(201);
      await expect(
        ctx.prisma.consultation.create({
          data: {
            patientId: patient.id,
            doctorId: doctor.doctorId,
            slotId: slot.id,
            scheduledStartsAt: slot.startsAt,
            scheduledEndsAt: slot.endsAt,
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
      expect(await ctx.prisma.consultation.count({ where: { slotId: slot.id } })).toBe(1);
      expect(first.body.id).toBeDefined();
    });
  });

  describe('idempotency', () => {
    it('replays the original response for the same key and never creates a duplicate', async () => {
      const slot = await createSlot(ctx, doctor.doctorId, 420);
      const key = randomUUID();
      const first = await book(ctx, patient, doctor.doctorId, slot.id, key).expect(201);
      const replay = await book(ctx, patient, doctor.doctorId, slot.id, key).expect(201);

      expect(replay.headers['idempotent-replayed']).toBe('true');
      expect(replay.body.id).toBe(first.body.id);
      expect(await ctx.prisma.consultation.count({ where: { slotId: slot.id } })).toBe(1);
      expect(
        await ctx.prisma.auditLog.count({ where: { action: 'booking.created', entityId: first.body.id } }),
      ).toBe(1);
    });

    it('CONCURRENCY: parallel retries with the same key produce one booking', async () => {
      const slot = await createSlot(ctx, doctor.doctorId, 480);
      const key = randomUUID();
      const results = await Promise.all(
        Array.from({ length: 8 }, () => book(ctx, patient, doctor.doctorId, slot.id, key)),
      );
      const statuses = results.map((r) => r.status);
      // Winner: 201. Others: 201 (replayed after completion) or 409 (claimed but not yet completed). Never a second real booking.
      expect(statuses.every((s) => s === 201 || s === 409)).toBe(true);
      expect(statuses).toContain(201);
      expect(await ctx.prisma.consultation.count({ where: { slotId: slot.id } })).toBe(1);
      const ids = new Set(results.filter((r) => r.status === 201).map((r) => r.body.id));
      expect(ids.size).toBe(1);
    });

    it('rejects the same key with a different payload (422)', async () => {
      const slotA = await createSlot(ctx, doctor.doctorId, 540);
      const slotB = await createSlot(ctx, doctor.doctorId, 600);
      const key = randomUUID();
      await book(ctx, patient, doctor.doctorId, slotA.id, key).expect(201);
      const res = await book(ctx, patient, doctor.doctorId, slotB.id, key).expect(422);
      expect(res.body.message).toMatch(/different request payload/);
      const slotBStored = await ctx.prisma.availabilitySlot.findUniqueOrThrow({ where: { id: slotB.id } });
      expect(slotBStored.status).toBe(SlotStatus.AVAILABLE);
    });

    it('keys are scoped per user', async () => {
      const slotA = await createSlot(ctx, doctor.doctorId, 660);
      const slotB = await createSlot(ctx, doctor.doctorId, 720);
      const key = 'shared-key';
      const other = await registerUser(ctx);
      await book(ctx, patient, doctor.doctorId, slotA.id, key).expect(201);
      await book(ctx, other, doctor.doctorId, slotB.id, key).expect(201);
    });

    it('a failed request releases the key so the client can retry', async () => {
      const booked = await createSlot(ctx, doctor.doctorId, 780);
      await book(ctx, patient, doctor.doctorId, booked.id).expect(201);
      const key = randomUUID();
      await book(ctx, patient, doctor.doctorId, booked.id, key).expect(409); // conflict, not stored
      const fresh = await createSlot(ctx, doctor.doctorId, 840);
      await book(ctx, patient, doctor.doctorId, fresh.id, key).expect(201); // same key, now succeeds
    });
  });

  describe('cancellation', () => {
    it('patient cancels: consultation CANCELLED, slot released, payment voided, audit written', async () => {
      const slot = await createSlot(ctx, doctor.doctorId, 900);
      const created = await book(ctx, patient, doctor.doctorId, slot.id).expect(201);
      const res = await ctx
        .http()
        .post(`/bookings/${created.body.id}/cancel`)
        .set(auth(patient))
        .send({ reason: 'schedule clash' })
        .expect(200);
      expect(res.body).toMatchObject({
        status: 'CANCELLED',
        cancellationReason: 'schedule clash',
        cancelledById: patient.id,
      });

      const stored = await ctx.prisma.availabilitySlot.findUniqueOrThrow({ where: { id: slot.id } });
      expect(stored.status).toBe(SlotStatus.AVAILABLE);
      const payment = await ctx.prisma.payment.findUniqueOrThrow({
        where: { consultationId: created.body.id },
      });
      expect(payment).toMatchObject({ status: 'FAILED', failureReason: 'consultation_cancelled' });
      const audit = await ctx.prisma.auditLog.findFirst({
        where: { action: 'booking.cancelled', entityId: created.body.id },
      });
      expect(audit?.actorId).toBe(patient.id);

      // The released slot can be booked again.
      const other = await registerUser(ctx);
      await book(ctx, other, doctor.doctorId, slot.id).expect(201);
    });

    it('cancelling a paid booking refunds the payment', async () => {
      const slot = await createSlot(ctx, doctor.doctorId, 960);
      const created = await book(ctx, patient, doctor.doctorId, slot.id).expect(201);
      await ctx
        .http()
        .post('/payments/intents')
        .set(auth(patient))
        .send({ consultationId: created.body.id })
        .expect(201);
      await ctx
        .http()
        .post(`/payments/${created.body.payment.id}/mock-confirm`)
        .set(auth(patient))
        .send({})
        .expect(201);
      await ctx.http().post(`/bookings/${created.body.id}/cancel`).set(auth(patient)).send({}).expect(200);
      const payment = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: created.body.payment.id } });
      expect(payment.status).toBe('REFUNDED');
      expect(payment.refundedAt).not.toBeNull();
      expect(payment.providerRefundId).toMatch(/^mock_re_/);
    });

    it('the doctor can cancel; another patient cannot; cancelling twice is rejected', async () => {
      const slot = await createSlot(ctx, doctor.doctorId, 1020);
      const created = await book(ctx, patient, doctor.doctorId, slot.id).expect(201);
      const other = await registerUser(ctx);
      await ctx.http().post(`/bookings/${created.body.id}/cancel`).set(auth(other)).send({}).expect(403);
      await ctx.http().post(`/bookings/${created.body.id}/cancel`).set(auth(doctor)).send({}).expect(200);
      const again = await ctx
        .http()
        .post(`/bookings/${created.body.id}/cancel`)
        .set(auth(patient))
        .send({})
        .expect(409);
      expect(again.body.message).toMatch(/terminal state/);
    });

    it('GET /bookings/:id enforces object-level access', async () => {
      const slot = await createSlot(ctx, doctor.doctorId, 1080);
      const created = await book(ctx, patient, doctor.doctorId, slot.id).expect(201);
      await ctx.http().get(`/bookings/${created.body.id}`).set(auth(patient)).expect(200);
      await ctx.http().get(`/bookings/${created.body.id}`).set(auth(doctor)).expect(200);
      const other = await registerUser(ctx);
      await ctx.http().get(`/bookings/${created.body.id}`).set(auth(other)).expect(403);
      await ctx.http().get(`/bookings/${randomUUID()}`).set(auth(patient)).expect(404);
    });
  });
});
