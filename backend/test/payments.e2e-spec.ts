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

describe('payments (e2e, mock provider)', () => {
  let ctx: TestContext;
  let doctor: TestDoctor;
  let patient: TestUser;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    doctor = await createVerifiedDoctor(ctx, { consultationFeeMinor: 123400 });
    patient = await registerUser(ctx);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  async function newBooking(withIntent = true) {
    const slot = await createSlot(ctx, doctor.doctorId);
    const res = await book(ctx, patient, doctor.doctorId, slot.id).expect(201);
    if (withIntent) {
      await ctx
        .http()
        .post('/payments/intents')
        .set(auth(patient))
        .send({ consultationId: res.body.id })
        .expect(201);
    }
    return { consultationId: res.body.id as string, paymentId: res.body.payment.id as string };
  }

  it('creates a payment intent with the doctor fee in minor units; repeating returns the same provider reference', async () => {
    const { consultationId, paymentId } = await newBooking(false);
    const first = await ctx
      .http()
      .post('/payments/intents')
      .set(auth(patient))
      .send({ consultationId })
      .expect(201);
    expect(first.body).toMatchObject({ paymentId, provider: 'MOCK', amountMinor: 123400, currency: 'INR' });
    expect(first.body.clientSecret).toBeDefined();

    const second = await ctx
      .http()
      .post('/payments/intents')
      .set(auth(patient))
      .send({ consultationId })
      .expect(201);
    expect(second.body.providerPaymentId).toBe(first.body.providerPaymentId);

    const stored = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(stored.status).toBe('PROCESSING');
    expect(
      await ctx.prisma.auditLog.count({ where: { action: 'payment.intent.created', entityId: paymentId } }),
    ).toBe(2);
  });

  it('IDEMPOTENCY: the same provider event applied twice settles the payment once', async () => {
    const { paymentId } = await newBooking();
    const first = await ctx
      .http()
      .post(`/payments/${paymentId}/mock-confirm`)
      .set(auth(patient))
      .send({ outcome: 'succeeded' })
      .expect(201);
    expect(first.body).toEqual({ received: true, duplicate: false, applied: true });

    const second = await ctx
      .http()
      .post(`/payments/${paymentId}/mock-confirm`)
      .set(auth(patient))
      .send({ outcome: 'succeeded' })
      .expect(201);
    expect(second.body).toEqual({ received: true, duplicate: true, applied: false });

    const payment = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('SUCCEEDED');
    expect(payment.paidAt).not.toBeNull();
    expect(await ctx.prisma.paymentEvent.count({ where: { paymentId } })).toBe(1);
    expect(
      await ctx.prisma.auditLog.count({ where: { action: 'payment.status.changed', entityId: paymentId } }),
    ).toBe(1);
    expect(
      await ctx.prisma.notificationJob.count({
        where: {
          type: 'payment.succeeded',
          recipientId: patient.id,
          payload: { path: ['paymentId'], equals: paymentId },
        },
      }),
    ).toBe(1);
  });

  it('a late failure event does not regress a succeeded payment', async () => {
    const { paymentId } = await newBooking();
    await ctx
      .http()
      .post(`/payments/${paymentId}/mock-confirm`)
      .set(auth(patient))
      .send({ outcome: 'succeeded' })
      .expect(201);
    const late = await ctx
      .http()
      .post(`/payments/${paymentId}/mock-confirm`)
      .set(auth(patient))
      .send({ outcome: 'failed' })
      .expect(201);
    expect(late.body.applied).toBe(false);
    const payment = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('SUCCEEDED');
  });

  it('a failed payment can be retried with a new intent', async () => {
    const { consultationId, paymentId } = await newBooking();
    await ctx
      .http()
      .post(`/payments/${paymentId}/mock-confirm`)
      .set(auth(patient))
      .send({ outcome: 'failed' })
      .expect(201);
    let payment = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment).toMatchObject({ status: 'FAILED', failureReason: 'mock_declined' });

    await ctx.http().post('/payments/intents').set(auth(patient)).send({ consultationId }).expect(201);
    payment = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment).toMatchObject({ status: 'PROCESSING', failureReason: null });
  });

  it('cannot pay after the payment succeeded', async () => {
    const { consultationId, paymentId } = await newBooking();
    await ctx.http().post(`/payments/${paymentId}/mock-confirm`).set(auth(patient)).send({}).expect(201);
    await ctx.http().post('/payments/intents').set(auth(patient)).send({ consultationId }).expect(409);
  });

  it('mock-confirm requires an intent first', async () => {
    const { paymentId } = await newBooking(false);
    await ctx.http().post(`/payments/${paymentId}/mock-confirm`).set(auth(patient)).send({}).expect(409);
  });

  it('object-level access on GET /payments/:id and intents', async () => {
    const { consultationId, paymentId } = await newBooking(false);
    const other = await registerUser(ctx);
    await ctx.http().get(`/payments/${paymentId}`).set(auth(other)).expect(403);
    await ctx.http().post('/payments/intents').set(auth(other)).send({ consultationId }).expect(403);
    await ctx.http().post(`/payments/${paymentId}/mock-confirm`).set(auth(other)).send({}).expect(403);

    const mine = await ctx.http().get(`/payments/${paymentId}`).set(auth(patient)).expect(200);
    expect(mine.body).toMatchObject({ id: paymentId, status: 'PENDING', amountMinor: 123400 });
    const admin = await createAdmin(ctx);
    await ctx.http().get(`/payments/${paymentId}`).set(auth(admin)).expect(200);
  });

  it('POST /payments/:id/sync reconciles with the provider and is a no-op for an open mock intent', async () => {
    const { paymentId } = await newBooking();
    const res = await ctx.http().post(`/payments/${paymentId}/sync`).set(auth(patient)).send().expect(200);
    expect(res.body).toMatchObject({ id: paymentId, status: 'PROCESSING' });
    const other = await registerUser(ctx);
    await ctx.http().post(`/payments/${paymentId}/sync`).set(auth(other)).send().expect(403);
    const fresh = await newBooking(false);
    await ctx.http().post(`/payments/${fresh.paymentId}/sync`).set(auth(patient)).send().expect(409);
  });

  it('the Stripe webhook endpoint is not served while the mock provider is active', async () => {
    await ctx
      .http()
      .post('/payments/webhook')
      .set('stripe-signature', 'sig')
      .send({ id: 'evt_1' })
      .expect(404);
  });
});
