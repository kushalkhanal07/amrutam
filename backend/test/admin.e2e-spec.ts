import {
  PASSWORD,
  TestContext,
  auth,
  book,
  createAdmin,
  createPaidBooking,
  createSlot,
  createTestApp,
  createVerifiedDoctor,
  registerUser,
  resetDatabase,
} from './helpers';

describe('admin analytics and audit logs (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('aggregates bookings, cancellations, payments and utilization; audit logs are filterable and admin-only', async () => {
    const admin = await createAdmin(ctx);
    const doctor = await createVerifiedDoctor(ctx);
    const patient = await registerUser(ctx);

    // One completed, one cancelled, one scheduled consultation + one free slot.
    const paid = await createPaidBooking(ctx, patient, doctor);
    await ctx.http().post(`/consultations/${paid.consultationId}/start`).set(auth(doctor)).expect(201);
    await ctx
      .http()
      .post(`/consultations/${paid.consultationId}/complete`)
      .set(auth(doctor))
      .send({})
      .expect(201);

    const slot2 = await createSlot(ctx, doctor.doctorId, 120);
    const cancelled = await book(ctx, patient, doctor.doctorId, slot2.id).expect(201);
    await ctx.http().post(`/bookings/${cancelled.body.id}/cancel`).set(auth(patient)).send({}).expect(200);

    const slot3 = await createSlot(ctx, doctor.doctorId, 180);
    await book(ctx, patient, doctor.doctorId, slot3.id).expect(201);
    await createSlot(ctx, doctor.doctorId, 240);

    const to = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const overview = await ctx.http().get(`/admin/analytics/overview?to=${to}`).set(auth(admin)).expect(200);
    expect(overview.body.bookings).toMatchObject({ total: 3, cancellations: 1 });
    expect(overview.body.bookings.byStatus).toMatchObject({ COMPLETED: 1, CANCELLED: 1, SCHEDULED: 1 });
    expect(overview.body.payments.byStatus).toMatchObject({ SUCCEEDED: 1, FAILED: 1, PENDING: 1 });
    expect(overview.body.payments.grossRevenueMinorByCurrency).toEqual({ INR: 50000 });
    expect(overview.body.slots).toMatchObject({
      total: 4,
      byStatus: { BOOKED: 2, AVAILABLE: 2 },
      utilization: 0.5,
    });
    expect(overview.body.newUsers).toMatchObject({ ADMIN: 1, DOCTOR: 1, PATIENT: 1 });

    const doctors = await ctx.http().get(`/admin/analytics/doctors?to=${to}`).set(auth(admin)).expect(200);
    expect(doctors.body.items).toHaveLength(1);
    expect(doctors.body.items[0]).toMatchObject({
      doctorId: doctor.doctorId,
      totalSlots: 4,
      bookedSlots: 2,
      utilization: 0.5,
      consultations: { scheduled: 1, completed: 1, cancelled: 1, noShow: 0 },
    });

    // Audit logs.
    await ctx.http().get('/admin/audit-logs').set(auth(patient)).expect(403);
    await ctx.http().get('/admin/audit-logs').set(auth(doctor)).expect(403);

    const all = await ctx.http().get('/admin/audit-logs?limit=100').set(auth(admin)).expect(200);
    const actions = new Set(all.body.items.map((e: { action: string }) => e.action));
    for (const expected of [
      'auth.register',
      'auth.login.success',
      'booking.created',
      'booking.cancelled',
      'consultation.status.changed',
      'payment.status.changed',
    ]) {
      expect(actions).toContain(expected);
    }

    const filtered = await ctx
      .http()
      .get(`/admin/audit-logs?action=booking.cancelled&entityId=${cancelled.body.id}`)
      .set(auth(admin))
      .expect(200);
    expect(filtered.body.total).toBe(1);
    expect(filtered.body.items[0]).toMatchObject({ actorId: patient.id, entityType: 'Consultation' });

    await ctx
      .http()
      .post('/auth/login')
      .send({ email: patient.email, password: 'nope-' + PASSWORD })
      .expect(401);
    const failures = await ctx
      .http()
      .get('/admin/audit-logs?action=auth.login.failure')
      .set(auth(admin))
      .expect(200);
    expect(failures.body.total).toBe(1);
    expect(JSON.stringify(failures.body)).not.toContain('nope-');
  });

  it('rejects invalid ranges', async () => {
    const admin = await createAdmin(ctx);
    await ctx
      .http()
      .get('/admin/analytics/overview?from=2026-01-01T00:00:00Z&to=2025-01-01T00:00:00Z')
      .set(auth(admin))
      .expect(400);
    await ctx.http().get('/admin/analytics/overview?from=not-a-date').set(auth(admin)).expect(400);
  });
});
