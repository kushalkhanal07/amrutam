// Runs before every e2e test file, before any application module is imported.
//
// Loads .env.test into process.env with override. This matters because
// @prisma/client reads `.env` into process.env as soon as it is required, and
// ConfigService falls back to process.env for unset keys; without this step a
// developer's real Stripe keys in `.env` would leak into the test run.
import { config } from 'dotenv';
import { resolve } from 'node:path';

process.env.NODE_ENV = 'test';
config({ path: resolve(__dirname, '..', '.env.test'), override: true });
process.env.NOTIFICATION_WORKER_ENABLED = 'false';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';
