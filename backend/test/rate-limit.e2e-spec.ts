import type { TestContext } from './helpers';

/**
 * Rate limiting is disabled for the rest of the suite (RATE_LIMIT_DISABLED=true
 * in .env.test). This file boots its own app with limits enabled. The env
 * override must happen before AppModule is imported, because ConfigModule
 * snapshots the environment when the module file is evaluated.
 */
describe('rate limiting (e2e)', () => {
  let ctx: TestContext;
  const previous = process.env.RATE_LIMIT_DISABLED;

  beforeAll(async () => {
    process.env.RATE_LIMIT_DISABLED = 'false';
    const helpers = await import('./helpers');
    ctx = await helpers.createTestApp();
    await helpers.resetDatabase(ctx.prisma);
  });

  afterAll(async () => {
    await ctx.app.close();
    if (previous === undefined) delete process.env.RATE_LIMIT_DISABLED;
    else process.env.RATE_LIMIT_DISABLED = previous;
  });

  it('limits /auth/login to 10 requests per minute per client', async () => {
    const attempt = () =>
      ctx.http().post('/auth/login').send({ email: 'nobody@test.local', password: 'wrong-password' });
    for (let i = 0; i < 10; i += 1) {
      await attempt().expect(401);
    }
    const blocked = await attempt().expect(429);
    expect(blocked.body).toMatchObject({ statusCode: 429 });
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('does not throttle health probes', async () => {
    for (let i = 0; i < 15; i += 1) {
      await ctx.http().get('/health').expect(200);
    }
  });
});
