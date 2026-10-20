import { Role } from '@prisma/client';
import { authenticator } from 'otplib';
import {
  PASSWORD,
  TestContext,
  auth,
  createAdmin,
  createTestApp,
  registerUser,
  resetDatabase,
  uniqueEmail,
} from './helpers';

describe('auth (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('registration and validation', () => {
    it('registers a patient, stores an argon2 hash and never returns it', async () => {
      const email = uniqueEmail();
      const res = await ctx
        .http()
        .post('/auth/register')
        .send({ email, password: PASSWORD, firstName: 'A', lastName: 'B' })
        .expect(201);
      expect(res.body).toMatchObject({ role: 'PATIENT', accessTokenExpiresIn: 900 });
      expect(res.body.accessToken).toBeDefined();
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');

      const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email } });
      expect(user.passwordHash.startsWith('$argon2id$')).toBe(true);
      expect(user.passwordHash).not.toContain(PASSWORD);
    });

    it('returns a structured 400 for invalid input and rejects unknown fields', async () => {
      const res = await ctx
        .http()
        .post('/auth/register')
        .send({ email: 'not-an-email', password: 'short', firstName: '', lastName: 'B', isAdmin: true })
        .expect(400);
      expect(res.body.statusCode).toBe(400);
      expect(Array.isArray(res.body.message)).toBe(true);
      expect(res.body.message.join(' ')).toMatch(/email/);
      expect(res.body.message.join(' ')).toMatch(/password/);
      expect(res.body.message.join(' ')).toMatch(/isAdmin/);
    });

    it('does not allow self-registration as ADMIN', async () => {
      await ctx
        .http()
        .post('/auth/register')
        .send({ email: uniqueEmail(), password: PASSWORD, firstName: 'A', lastName: 'B', role: 'ADMIN' })
        .expect(400);
    });

    it('rejects duplicate emails with 409', async () => {
      const email = uniqueEmail();
      await ctx
        .http()
        .post('/auth/register')
        .send({ email, password: PASSWORD, firstName: 'A', lastName: 'B' })
        .expect(201);
      await ctx
        .http()
        .post('/auth/register')
        .send({ email: email.toUpperCase(), password: PASSWORD, firstName: 'A', lastName: 'B' })
        .expect(409);
    });
  });

  describe('login', () => {
    it('rejects a wrong password with 401 and records an audit event', async () => {
      const user = await registerUser(ctx);
      await ctx
        .http()
        .post('/auth/login')
        .send({ email: user.email, password: 'wrong-password' })
        .expect(401);
      const events = await ctx.prisma.auditLog.findMany({
        where: { action: 'auth.login.failure', entityId: user.id },
      });
      expect(events).toHaveLength(1);
      expect(events[0].metadata).toEqual({ reason: 'bad_password' });
    });

    it('uses the same message for unknown emails', async () => {
      const res = await ctx
        .http()
        .post('/auth/login')
        .send({ email: 'ghost@test.local', password: PASSWORD })
        .expect(401);
      expect(res.body.message).toBe('Invalid email or password');
    });

    it('logs in with valid credentials', async () => {
      const user = await registerUser(ctx);
      const res = await ctx
        .http()
        .post('/auth/login')
        .send({ email: user.email, password: PASSWORD })
        .expect(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
    });
  });

  describe('refresh token rotation', () => {
    it('rotates the token, rejects reuse of the old one and revokes the family', async () => {
      const user = await registerUser(ctx);
      const first = await ctx
        .http()
        .post('/auth/refresh')
        .send({ refreshToken: user.refreshToken })
        .expect(200);
      expect(first.body.refreshToken).not.toBe(user.refreshToken);

      // Replaying the original (already rotated) token is treated as theft.
      const reuse = await ctx
        .http()
        .post('/auth/refresh')
        .send({ refreshToken: user.refreshToken })
        .expect(401);
      expect(reuse.body.message).toMatch(/reuse detected/);

      // The whole family, including the freshly issued token, is now dead.
      await ctx.http().post('/auth/refresh').send({ refreshToken: first.body.refreshToken }).expect(401);

      const stored = await ctx.prisma.refreshToken.findMany({ where: { userId: user.id } });
      expect(stored.every((t) => t.revokedAt !== null)).toBe(true);
      expect(stored.some((t) => t.tokenHash === user.refreshToken)).toBe(false); // only hashes are stored
    });

    it('logout revokes the refresh token', async () => {
      const user = await registerUser(ctx);
      await ctx
        .http()
        .post('/auth/logout')
        .set(auth(user))
        .send({ refreshToken: user.refreshToken })
        .expect(204);
      await ctx.http().post('/auth/refresh').send({ refreshToken: user.refreshToken }).expect(401);
    });
  });

  describe('authorization', () => {
    it('rejects missing and malformed tokens', async () => {
      await ctx.http().get('/users/me').expect(401);
      await ctx.http().get('/users/me').set('Authorization', 'Bearer not-a-jwt').expect(401);
    });

    it('enforces roles: patients cannot reach admin endpoints', async () => {
      const patient = await registerUser(ctx);
      const res = await ctx.http().get('/admin/analytics/overview').set(auth(patient)).expect(403);
      expect(res.body.message).toBe('Insufficient role');
      await ctx.http().get('/users').set(auth(patient)).expect(403);
    });

    it('admins can change roles and the change is audited and effective immediately', async () => {
      const admin = await createAdmin(ctx);
      const patient = await registerUser(ctx);
      await ctx
        .http()
        .patch(`/users/${patient.id}/role`)
        .set(auth(admin))
        .send({ role: 'DOCTOR' })
        .expect(200);
      // Existing access token still works but now carries the new role (re-read on every request).
      const me = await ctx.http().get('/users/me').set(auth(patient)).expect(200);
      expect(me.body.role).toBe('DOCTOR');
      const audit = await ctx.prisma.auditLog.findFirst({
        where: { action: 'user.role.changed', entityId: patient.id },
      });
      expect(audit?.metadata).toEqual({ from: 'PATIENT', to: 'DOCTOR' });
      expect(audit?.actorId).toBe(admin.id);
    });

    it('suspended users lose access immediately', async () => {
      const admin = await createAdmin(ctx);
      const patient = await registerUser(ctx);
      await ctx
        .http()
        .patch(`/users/${patient.id}/status`)
        .set(auth(admin))
        .send({ status: 'SUSPENDED' })
        .expect(200);
      await ctx.http().get('/users/me').set(auth(patient)).expect(401);
      await ctx.http().post('/auth/login').send({ email: patient.email, password: PASSWORD }).expect(403);
    });

    it('never returns the password hash or MFA secret from /users/me', async () => {
      const patient = await registerUser(ctx);
      const me = await ctx.http().get('/users/me').set(auth(patient)).expect(200);
      expect(me.body.passwordHash).toBeUndefined();
      expect(me.body.mfaSecret).toBeUndefined();
      expect(me.body.profile.firstName).toBe('Test');
    });
  });

  describe('MFA (TOTP) for doctor accounts', () => {
    it('is not available to patients', async () => {
      const patient = await registerUser(ctx);
      await ctx.http().post('/auth/mfa/setup').set(auth(patient)).expect(403);
    });

    it('setup -> enable -> login challenge -> verify', async () => {
      const doctor = await registerUser(ctx, Role.DOCTOR);
      const setup = await ctx.http().post('/auth/mfa/setup').set(auth(doctor)).expect(201);
      expect(setup.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
      const secret: string = setup.body.secret;

      // Secret stored encrypted, not in plaintext.
      const stored = await ctx.prisma.user.findUniqueOrThrow({ where: { id: doctor.id } });
      expect(stored.mfaSecret).not.toContain(secret);

      await ctx.http().post('/auth/mfa/enable').set(auth(doctor)).send({ code: '000000' }).expect(401);
      await ctx
        .http()
        .post('/auth/mfa/enable')
        .set(auth(doctor))
        .send({ code: authenticator.generate(secret) })
        .expect(204);

      const login = await ctx
        .http()
        .post('/auth/login')
        .send({ email: doctor.email, password: PASSWORD })
        .expect(200);
      expect(login.body).toMatchObject({ mfaRequired: true });
      expect(login.body.accessToken).toBeUndefined();

      await ctx
        .http()
        .post('/auth/mfa/verify')
        .send({ mfaToken: login.body.mfaToken, code: '123456' })
        .expect(401);
      const verified = await ctx
        .http()
        .post('/auth/mfa/verify')
        .send({ mfaToken: login.body.mfaToken, code: authenticator.generate(secret) })
        .expect(200);
      expect(verified.body.accessToken).toBeDefined();
      expect(verified.body.role).toBe('DOCTOR');
    });
  });
});
