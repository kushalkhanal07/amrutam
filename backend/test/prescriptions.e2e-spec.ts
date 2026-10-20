import {
  TestContext,
  TestDoctor,
  TestUser,
  auth,
  createAdmin,
  createPaidBooking,
  createTestApp,
  createVerifiedDoctor,
  registerUser,
  resetDatabase,
} from './helpers';

describe('prescriptions (e2e)', () => {
  let ctx: TestContext;
  let doctor: TestDoctor;
  let patient: TestUser;

  const body = (consultationId: string) => ({
    consultationId,
    diagnosis: 'Seasonal allergy',
    instructions: 'Avoid dust',
    items: [{ medicationName: 'Cetirizine', dosage: '10mg', frequency: 'once daily', durationDays: 7 }],
  });

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    doctor = await createVerifiedDoctor(ctx);
    patient = await registerUser(ctx);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  async function inProgressConsultation() {
    const { consultationId } = await createPaidBooking(ctx, patient, doctor);
    await ctx.http().post(`/consultations/${consultationId}/start`).set(auth(doctor)).expect(201);
    return consultationId;
  }

  it('cannot prescribe for a SCHEDULED consultation', async () => {
    const { consultationId } = await createPaidBooking(ctx, patient, doctor);
    await ctx.http().post('/prescriptions').set(auth(doctor)).send(body(consultationId)).expect(409);
  });

  it('the consulting doctor creates a prescription; it is audited without clinical content and notifies the patient', async () => {
    const consultationId = await inProgressConsultation();
    const res = await ctx
      .http()
      .post('/prescriptions')
      .set(auth(doctor))
      .send(body(consultationId))
      .expect(201);
    expect(res.body).toMatchObject({ consultationId, patientId: patient.id, diagnosis: 'Seasonal allergy' });
    expect(res.body.items).toHaveLength(1);
    expect(res.body.doctor.userId).toBeUndefined();

    const audit = await ctx.prisma.auditLog.findFirstOrThrow({
      where: { action: 'prescription.created', entityId: res.body.id },
    });
    expect(audit.metadata).toEqual({ consultationId, itemCount: 1 });
    expect(JSON.stringify(audit)).not.toMatch(/allergy|Cetirizine/i);

    const job = await ctx.prisma.notificationJob.findFirst({
      where: { type: 'prescription.issued', recipientId: patient.id },
    });
    expect(job).not.toBeNull();

    // Only one prescription per consultation.
    await ctx.http().post('/prescriptions').set(auth(doctor)).send(body(consultationId)).expect(409);
  });

  it('access control: patient owner, issuing doctor and admin can read; others cannot', async () => {
    const consultationId = await inProgressConsultation();
    const created = await ctx
      .http()
      .post('/prescriptions')
      .set(auth(doctor))
      .send(body(consultationId))
      .expect(201);
    const id = created.body.id;

    await ctx.http().get(`/prescriptions/${id}`).set(auth(patient)).expect(200);
    await ctx.http().get(`/prescriptions/${id}`).set(auth(doctor)).expect(200);
    await ctx.http().get(`/consultations/${consultationId}/prescription`).set(auth(patient)).expect(200);
    const admin = await createAdmin(ctx);
    await ctx.http().get(`/prescriptions/${id}`).set(auth(admin)).expect(200);

    const otherPatient = await registerUser(ctx);
    const otherDoctor = await createVerifiedDoctor(ctx);
    await ctx.http().get(`/prescriptions/${id}`).set(auth(otherPatient)).expect(403);
    await ctx.http().get(`/prescriptions/${id}`).set(auth(otherDoctor)).expect(403);
    await ctx.http().get(`/consultations/${consultationId}/prescription`).set(auth(otherPatient)).expect(403);
  });

  it('only doctors can create, and only for their own consultations', async () => {
    const consultationId = await inProgressConsultation();
    await ctx.http().post('/prescriptions').set(auth(patient)).send(body(consultationId)).expect(403);
    const otherDoctor = await createVerifiedDoctor(ctx);
    await ctx.http().post('/prescriptions').set(auth(otherDoctor)).send(body(consultationId)).expect(403);
  });

  it('validates items', async () => {
    const consultationId = await inProgressConsultation();
    const res = await ctx
      .http()
      .post('/prescriptions')
      .set(auth(doctor))
      .send({ consultationId, diagnosis: 'x', items: [] })
      .expect(400);
    expect(res.body.message.join(' ')).toMatch(/items/);
    await ctx
      .http()
      .post('/prescriptions')
      .set(auth(doctor))
      .send({
        consultationId,
        diagnosis: 'x',
        items: [{ medicationName: 'm', dosage: '1', frequency: 'f', durationDays: 0 }],
      })
      .expect(400);
  });

  it("GET /prescriptions lists only the caller's prescriptions", async () => {
    const mine = await ctx.http().get('/prescriptions').set(auth(patient)).expect(200);
    expect(mine.body.total).toBeGreaterThan(0);
    expect(mine.body.items.every((p: { patientId: string }) => p.patientId === patient.id)).toBe(true);
    const stranger = await registerUser(ctx);
    const none = await ctx.http().get('/prescriptions').set(auth(stranger)).expect(200);
    expect(none.body.total).toBe(0);
  });
});
