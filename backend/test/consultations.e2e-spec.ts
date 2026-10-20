import {
  TestContext,
  TestDoctor,
  TestUser,
  auth,
  book,
  createPaidBooking,
  createSlot,
  createTestApp,
  createVerifiedDoctor,
  registerUser,
  resetDatabase,
} from './helpers';

describe('consultation lifecycle (e2e)', () => {
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

  it('cannot start before payment succeeded', async () => {
    const slot = await createSlot(ctx, doctor.doctorId);
    const created = await book(ctx, patient, doctor.doctorId, slot.id).expect(201);
    const res = await ctx
      .http()
      .post(`/consultations/${created.body.id}/start`)
      .set(auth(doctor))
      .expect(409);
    expect(res.body.message).toMatch(/payment/);
  });

  it('SCHEDULED -> IN_PROGRESS -> COMPLETED with audit trail and simulated video session', async () => {
    const { consultationId } = await createPaidBooking(ctx, patient, doctor);

    const started = await ctx
      .http()
      .post(`/consultations/${consultationId}/start`)
      .set(auth(doctor))
      .expect(201);
    expect(started.body.status).toBe('IN_PROGRESS');
    expect(started.body.startedAt).toBeDefined();
    expect(started.body.video.joinUrl).toBe(
      `http://localhost:5173/session/${consultationId}?room=${started.body.videoSessionId}`,
    );
    expect(started.body.videoSessionId).toMatch(/^sim_/);

    // Both participants can fetch the join details while the session is live.
    const session = await ctx
      .http()
      .get(`/consultations/${consultationId}/session`)
      .set(auth(patient))
      .expect(200);
    expect(session.body.joinUrl).toBe(started.body.video.joinUrl);
    expect(session.body.mode).toBeDefined();

    const email = await ctx.prisma.notificationJob.findFirst({
      where: { type: 'consultation.started', payload: { path: ['consultationId'], equals: consultationId } },
    });
    expect(email?.payload).toMatchObject({ joinUrl: started.body.video.joinUrl });

    const completed = await ctx
      .http()
      .post(`/consultations/${consultationId}/complete`)
      .set(auth(doctor))
      .send({ doctorNotes: 'Advised rest' })
      .expect(201);
    expect(completed.body.status).toBe('COMPLETED');
    expect(completed.body.endedAt).toBeDefined();
    expect(completed.body.doctorNotes).toBe('Advised rest');

    const events = await ctx.prisma.auditLog.findMany({
      where: { action: 'consultation.status.changed', entityId: consultationId },
      orderBy: { createdAt: 'asc' },
    });
    expect(events.map((e) => e.metadata)).toEqual([
      { from: 'SCHEDULED', to: 'IN_PROGRESS' },
      { from: 'IN_PROGRESS', to: 'COMPLETED' },
    ]);
    // Audit rows never contain the clinical notes.
    expect(JSON.stringify(events)).not.toContain('Advised rest');
  });

  it('rejects invalid transitions', async () => {
    const { consultationId } = await createPaidBooking(ctx, patient, doctor);

    // SCHEDULED -> COMPLETED is not allowed.
    const bad = await ctx
      .http()
      .post(`/consultations/${consultationId}/complete`)
      .set(auth(doctor))
      .send({})
      .expect(409);
    expect(bad.body.message).toMatch(/Cannot move consultation from SCHEDULED to COMPLETED/);

    await ctx.http().post(`/consultations/${consultationId}/start`).set(auth(doctor)).expect(201);
    // IN_PROGRESS cannot be cancelled or started again.
    await ctx.http().post(`/bookings/${consultationId}/cancel`).set(auth(patient)).send({}).expect(409);
    await ctx.http().post(`/consultations/${consultationId}/start`).set(auth(doctor)).expect(409);

    await ctx.http().post(`/consultations/${consultationId}/complete`).set(auth(doctor)).send({}).expect(201);
    // COMPLETED is terminal.
    await ctx.http().post(`/consultations/${consultationId}/complete`).set(auth(doctor)).send({}).expect(409);
    await ctx.http().post(`/consultations/${consultationId}/no-show`).set(auth(doctor)).expect(409);
  });

  it('no-show is rejected before the scheduled start', async () => {
    const { consultationId } = await createPaidBooking(ctx, patient, doctor);
    const res = await ctx
      .http()
      .post(`/consultations/${consultationId}/no-show`)
      .set(auth(doctor))
      .expect(409);
    expect(res.body.message).toMatch(/before the scheduled start/);
  });

  it('only the consulting doctor can drive the lifecycle', async () => {
    const { consultationId } = await createPaidBooking(ctx, patient, doctor);
    const otherDoctor = await createVerifiedDoctor(ctx);
    await ctx.http().post(`/consultations/${consultationId}/start`).set(auth(patient)).expect(403);
    await ctx.http().post(`/consultations/${consultationId}/start`).set(auth(otherDoctor)).expect(403);
  });

  it('lists are scoped to the caller', async () => {
    const otherPatient = await registerUser(ctx);
    const mine = await ctx.http().get('/consultations').set(auth(patient)).expect(200);
    expect(mine.body.items.length).toBeGreaterThan(0);
    expect(mine.body.items.every((c: { patientId: string }) => c.patientId === patient.id)).toBe(true);

    const theirs = await ctx.http().get('/consultations').set(auth(otherPatient)).expect(200);
    expect(theirs.body.items).toHaveLength(0);

    const asDoctor = await ctx.http().get('/consultations?status=COMPLETED').set(auth(doctor)).expect(200);
    expect(
      asDoctor.body.items.every(
        (c: { doctorId: string; status: string }) =>
          c.doctorId === doctor.doctorId && c.status === 'COMPLETED',
      ),
    ).toBe(true);

    await ctx.http().get(`/consultations/${mine.body.items[0].id}`).set(auth(otherPatient)).expect(403);
  });

  it('paginates with bounds', async () => {
    const res = await ctx.http().get('/consultations?page=1&limit=2').set(auth(patient)).expect(200);
    expect(res.body.items.length).toBeLessThanOrEqual(2);
    expect(res.body).toMatchObject({ page: 1, limit: 2 });
    await ctx.http().get('/consultations?limit=500').set(auth(patient)).expect(400);
  });
});
