import { Role } from '@prisma/client';
import {
  TestContext,
  auth,
  createAdmin,
  createSlot,
  createTestApp,
  createVerifiedDoctor,
  registerUser,
  resetDatabase,
} from './helpers';

describe('doctors and availability (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('search returns only verified doctors with filters, sorting and pagination', async () => {
    const cheap = await createVerifiedDoctor(ctx, {
      specialization: 'Ayurveda',
      consultationFeeMinor: 20000,
    });
    const pricey = await createVerifiedDoctor(ctx, {
      specialization: 'Ayurveda',
      consultationFeeMinor: 90000,
    });
    await createVerifiedDoctor(ctx, { specialization: 'Dermatology', consultationFeeMinor: 30000 });
    const unverified = await registerUser(ctx, Role.DOCTOR);
    await ctx
      .http()
      .post('/doctors/me')
      .set(auth(unverified))
      .send({ specialization: 'Ayurveda', consultationFeeMinor: 100 })
      .expect(201);
    await createSlot(ctx, cheap.doctorId, 60);

    const all = await ctx.http().get('/doctors').expect(200);
    expect(all.body.total).toBe(3);
    expect(
      all.body.items.every((d: { verificationStatus: string }) => d.verificationStatus === 'VERIFIED'),
    ).toBe(true);
    expect(JSON.stringify(all.body)).not.toContain('@test.local'); // no emails in public listing

    const ayurveda = await ctx
      .http()
      .get('/doctors?specialization=ayurveda&sortBy=fee&sortDir=asc')
      .expect(200);
    expect(ayurveda.body.items.map((d: { id: string }) => d.id)).toEqual([cheap.doctorId, pricey.doctorId]);

    const affordable = await ctx.http().get('/doctors?maxFeeMinor=30000').expect(200);
    expect(affordable.body.total).toBe(2);

    const available = await ctx.http().get('/doctors?availableOnly=true').expect(200);
    expect(available.body.items.map((d: { id: string }) => d.id)).toEqual([cheap.doctorId]);

    const paged = await ctx.http().get('/doctors?limit=2&page=2').expect(200);
    expect(paged.body).toMatchObject({ page: 2, limit: 2, total: 3, totalPages: 2 });
    expect(paged.body.items).toHaveLength(1);

    await ctx.http().get('/doctors?limit=1000').expect(400);
    await ctx.http().get('/doctors?sortBy=password').expect(400);
  });

  it('doctor manages own slots; overlaps, past times and bad ranges are rejected; booked slots cannot be deleted', async () => {
    const doctor = await createVerifiedDoctor(ctx);
    const base = new Date(Date.now() + 24 * 3_600_000);
    base.setUTCMinutes(0, 0, 0);
    const iso = (offsetMin: number) => new Date(base.getTime() + offsetMin * 60_000).toISOString();

    const created = await ctx
      .http()
      .post('/availability')
      .set(auth(doctor))
      .send({
        slots: [
          { startsAt: iso(0), endsAt: iso(30) },
          { startsAt: iso(30), endsAt: iso(60) },
        ],
      })
      .expect(201);
    expect(created.body).toHaveLength(2);

    // Overlapping with an existing slot.
    await ctx
      .http()
      .post('/availability')
      .set(auth(doctor))
      .send({ slots: [{ startsAt: iso(15), endsAt: iso(45) }] })
      .expect(409);
    // Ends before it starts / in the past.
    await ctx
      .http()
      .post('/availability')
      .set(auth(doctor))
      .send({ slots: [{ startsAt: iso(90), endsAt: iso(80) }] })
      .expect(400);
    await ctx
      .http()
      .post('/availability')
      .set(auth(doctor))
      .send({ slots: [{ startsAt: '2020-01-01T00:00:00Z', endsAt: '2020-01-01T00:30:00Z' }] })
      .expect(400);

    const generated = await ctx
      .http()
      .post('/availability/generate')
      .set(auth(doctor))
      .send({ from: iso(120), to: iso(240), durationMinutes: 30 })
      .expect(201);
    expect(generated.body).toHaveLength(4);

    const pub = await ctx.http().get(`/doctors/${doctor.doctorId}/availability`).expect(200);
    expect(pub.body).toHaveLength(6);

    // Block / unblock.
    const slotId = created.body[0].id;
    await ctx.http().post(`/availability/${slotId}/block`).set(auth(doctor)).expect(201);
    expect((await ctx.http().get(`/doctors/${doctor.doctorId}/availability`).expect(200)).body).toHaveLength(
      5,
    );
    await ctx.http().post(`/availability/${slotId}/unblock`).set(auth(doctor)).expect(201);

    // Another doctor cannot delete it.
    const other = await createVerifiedDoctor(ctx);
    await ctx.http().delete(`/availability/${slotId}`).set(auth(other)).expect(403);

    // Booked slots cannot be deleted.
    const patient = await registerUser(ctx);
    await ctx
      .http()
      .post('/bookings')
      .set(auth(patient))
      .set('Idempotency-Key', 'k1')
      .send({ doctorId: doctor.doctorId, slotId })
      .expect(201);
    await ctx.http().delete(`/availability/${slotId}`).set(auth(doctor)).expect(409);
    await ctx.http().delete(`/availability/${created.body[1].id}`).set(auth(doctor)).expect(204);

    // Patients cannot manage availability.
    await ctx.http().post('/availability').set(auth(patient)).send({ slots: [] }).expect(403);
  });

  it('admin verification is audited and controls search visibility', async () => {
    const admin = await createAdmin(ctx);
    const doctorUser = await registerUser(ctx, Role.DOCTOR);
    const profile = await ctx
      .http()
      .post('/doctors/me')
      .set(auth(doctorUser))
      .send({ specialization: 'Cardiology', consultationFeeMinor: 80000 })
      .expect(201);
    expect(profile.body.verificationStatus).toBe('PENDING');
    await ctx
      .http()
      .post('/doctors/me')
      .set(auth(doctorUser))
      .send({ specialization: 'Cardiology', consultationFeeMinor: 80000 })
      .expect(409);

    expect((await ctx.http().get('/doctors?specialization=Cardiology').expect(200)).body.total).toBe(0);
    await ctx
      .http()
      .patch(`/doctors/${profile.body.id}/verification`)
      .set(auth(doctorUser))
      .send({ status: 'VERIFIED' })
      .expect(403);
    await ctx
      .http()
      .patch(`/doctors/${profile.body.id}/verification`)
      .set(auth(admin))
      .send({ status: 'VERIFIED' })
      .expect(200);
    expect((await ctx.http().get('/doctors?specialization=Cardiology').expect(200)).body.total).toBe(1);

    const audit = await ctx.prisma.auditLog.findFirst({
      where: { action: 'doctor.verification.changed', entityId: profile.body.id },
    });
    expect(audit?.metadata).toEqual({ from: 'PENDING', to: 'VERIFIED' });
  });
});
