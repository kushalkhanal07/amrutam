import { AddressInfo } from 'node:net';
import { io, Socket } from 'socket.io-client';
import {
  TestContext,
  TestDoctor,
  TestUser,
  auth,
  createPaidBooking,
  createTestApp,
  createVerifiedDoctor,
  registerUser,
  resetDatabase,
} from './helpers';

type Ack = Record<string, unknown> & { error?: string };

function connect(baseUrl: string, token: string | null): Socket {
  return io(`${baseUrl}/chat`, {
    auth: token ? { token } : {},
    transports: ['websocket'],
    reconnection: false,
  });
}

function emitWithAck(socket: Socket, event: string, body: unknown): Promise<Ack> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`no ack for ${event}`)), 5000);
    socket.emit(event, body, (res: Ack) => {
      clearTimeout(t);
      resolve(res);
    });
  });
}

function waitFor<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), 5000);
    socket.once(event, (payload: T) => {
      clearTimeout(t);
      resolve(payload);
    });
  });
}

function connected(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', (err) => reject(err));
  });
}

describe('real-time consultation chat (e2e)', () => {
  let ctx: TestContext;
  let baseUrl: string;
  let doctor: TestDoctor;
  let patient: TestUser;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    await ctx.app.listen(0); // Socket.IO needs a real listening server
    const { port } = ctx.app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    doctor = await createVerifiedDoctor(ctx);
    patient = await registerUser(ctx);
  });

  afterEach(() => {
    sockets.splice(0).forEach((s) => s.disconnect());
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const open = (token: string | null) => {
    const s = connect(baseUrl, token);
    sockets.push(s);
    return s;
  };

  it('rejects the handshake without a valid access token', async () => {
    const s = open('not-a-token');
    const err = await waitFor<Error & { data?: { code?: string } }>(s, 'connect_error');
    expect(err.message).toMatch(/sign in/i);
    expect(err.data).toEqual({ code: 'UNAUTHORIZED' });
    expect(s.connected).toBe(false);
  });

  it('delivers messages between the doctor and the patient and stores the history', async () => {
    const { consultationId } = await createPaidBooking(ctx, patient, doctor);
    await ctx.http().post(`/consultations/${consultationId}/start`).set(auth(doctor)).expect(201);

    const doc = open(doctor.accessToken);
    const pat = open(patient.accessToken);
    await Promise.all([connected(doc), connected(pat)]);

    const docJoin = await emitWithAck(doc, 'chat:join', { consultationId });
    expect(docJoin).toMatchObject({ ok: true });

    const presence = waitFor<{ userId: string; online: boolean }>(doc, 'chat:presence');
    const patJoin = await emitWithAck(pat, 'chat:join', { consultationId });
    expect(patJoin).toMatchObject({ ok: true });
    expect((patJoin.online as { userId: string }[]).map((u) => u.userId)).toContain(doctor.id);
    expect(await presence).toMatchObject({ userId: patient.id, online: true });

    const received = waitFor<{ text: string; senderId: string; senderName: string }>(pat, 'chat:message');
    const sent = await emitWithAck(doc, 'chat:send', {
      consultationId,
      text: '  Hello, how are you feeling?  ',
    });
    expect(sent).toMatchObject({
      text: 'Hello, how are you feeling?',
      senderId: doctor.id,
      senderRole: 'DOCTOR',
    });
    expect(await received).toMatchObject({ text: 'Hello, how are you feeling?', senderId: doctor.id });

    const typing = waitFor<{ userId: string; typing: boolean }>(doc, 'chat:typing');
    pat.emit('chat:typing', { consultationId, typing: true });
    expect(await typing).toEqual({ userId: patient.id, typing: true });

    const reply = await emitWithAck(pat, 'chat:send', { consultationId, text: 'Much better, thank you.' });
    expect(reply).toMatchObject({ senderId: patient.id, senderRole: 'PATIENT' });

    const history = await ctx
      .http()
      .get(`/consultations/${consultationId}/messages`)
      .set(auth(patient))
      .expect(200);
    expect(history.body.map((m: { text: string }) => m.text)).toEqual([
      'Hello, how are you feeling?',
      'Much better, thank you.',
    ]);

    // Nothing clinical leaks into the audit log or notifications.
    const audit = await ctx.prisma.auditLog.findMany({ where: { entityId: consultationId } });
    expect(JSON.stringify(audit)).not.toContain('feeling');
  });

  it('refuses outsiders, empty messages and messages outside an in-progress consultation', async () => {
    const { consultationId } = await createPaidBooking(ctx, patient, doctor);
    const stranger = await registerUser(ctx);

    const s = open(stranger.accessToken);
    await connected(s);
    expect((await emitWithAck(s, 'chat:join', { consultationId })).error).toMatch(/access/i);
    await ctx.http().get(`/consultations/${consultationId}/messages`).set(auth(stranger)).expect(403);

    const pat = open(patient.accessToken);
    await connected(pat);
    expect(await emitWithAck(pat, 'chat:join', { consultationId })).toMatchObject({ ok: true });
    // Not started yet: SCHEDULED.
    expect((await emitWithAck(pat, 'chat:send', { consultationId, text: 'hi' })).error).toMatch(
      /in progress/i,
    );
    expect((await emitWithAck(pat, 'chat:send', { consultationId: 'nope', text: 'hi' })).error).toMatch(
      /UUID/,
    );

    await ctx.http().post(`/consultations/${consultationId}/start`).set(auth(doctor)).expect(201);
    expect((await emitWithAck(pat, 'chat:send', { consultationId, text: '   ' })).error).toMatch(/empty/i);
    expect((await emitWithAck(pat, 'chat:send', { consultationId, text: 'x'.repeat(2001) })).error).toMatch(
      /too long/i,
    );
  });
});
