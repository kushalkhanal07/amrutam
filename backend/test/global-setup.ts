/** Applies migrations to the test database once before the e2e suite runs. */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function loadTestDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const envFile = join(__dirname, '..', '.env.test');
  if (existsSync(envFile)) {
    const line = readFileSync(envFile, 'utf8')
      .split('\n')
      .find((l) => l.startsWith('DATABASE_URL='));
    if (line) return line.slice('DATABASE_URL='.length).trim();
  }
  throw new Error('Set TEST_DATABASE_URL or create .env.test with DATABASE_URL');
}

export default function globalSetup(): void {
  const url = loadTestDatabaseUrl();
  if (!/_test\b/.test(url)) {
    throw new Error(`Refusing to run e2e tests against a database whose name does not end in _test: ${url}`);
  }
  process.env.DATABASE_URL = url;
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
}
