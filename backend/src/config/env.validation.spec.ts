import { validateEnv } from './env.validation';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'x'.repeat(40),
  MFA_ENCRYPTION_KEY: 'f'.repeat(64),
};

describe('validateEnv', () => {
  it('accepts a minimal valid configuration and applies defaults', () => {
    const env = validateEnv({ ...valid });
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.RATE_LIMIT_MAX).toBe(120);
  });

  it('coerces numeric and boolean strings', () => {
    const env = validateEnv({ ...valid, PORT: '8080', SWAGGER_ENABLED: 'false', METRICS_ENABLED: '1' });
    expect(env.PORT).toBe(8080);
    expect(env.SWAGGER_ENABLED).toBe(false);
    expect(env.METRICS_ENABLED).toBe(true);
  });

  it('treats empty strings as unset so optional placeholders work', () => {
    const env = validateEnv({ ...valid, STRIPE_SECRET_KEY: '' });
    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
  });

  it('rejects a short JWT secret', () => {
    expect(() => validateEnv({ ...valid, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rejects a malformed database url', () => {
    expect(() => validateEnv({ ...valid, DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-hex MFA key', () => {
    expect(() => validateEnv({ ...valid, MFA_ENCRYPTION_KEY: 'zz' })).toThrow(/MFA_ENCRYPTION_KEY/);
  });
});
