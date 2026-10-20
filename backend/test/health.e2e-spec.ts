import { TestContext, createTestApp } from './helpers';

describe('health endpoints (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('GET /health answers without touching dependencies', async () => {
    const res = await ctx.http().get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok' });
    expect(typeof res.body.uptimeSeconds).toBe('number');
  });

  it('GET /ready reports database status', async () => {
    const res = await ctx.http().get('/ready').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.info.database.status).toBe('up');
  });

  it('GET /metrics exposes Prometheus metrics including db_up and http histograms', async () => {
    await ctx.http().get('/health').expect(200);
    const res = await ctx.http().get('/metrics').expect(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('db_up 1');
    expect(res.text).toContain('http_request_duration_seconds_bucket');
    expect(res.text).toMatch(/http_requests_total\{method="GET",route="\/health",status_code="200"\}/);
  });

  it('echoes or mints an X-Request-Id and includes it in error responses', async () => {
    const res = await ctx.http().get('/users/me').set('X-Request-Id', 'trace-abc').expect(401);
    expect(res.headers['x-request-id']).toBe('trace-abc');
    expect(res.body).toMatchObject({ statusCode: 401, requestId: 'trace-abc', path: '/users/me' });
  });
});
