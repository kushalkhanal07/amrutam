# Amrutam Telemedicine Backend

Production-oriented REST backend for the Amrutam telemedicine system: patients find doctors,
book consultation slots, pay (Stripe or a built-in mock), hold the consultation, receive
prescriptions; admins get analytics and a full audit trail.

**Stack:** Node.js 20+ · TypeScript · NestJS 11 · PostgreSQL 17 · Prisma 6 · JWT + refresh-token
rotation · TOTP MFA · Stripe · Pino logs · OpenTelemetry · Prometheus/Grafana · Jest + Supertest ·
Docker · GitHub Actions.

Documentation lives in [`docs/`](docs/): [architecture](docs/architecture.md),
[booking sequence](docs/booking-sequence.md), [ERD](docs/erd.md), [API](docs/api.md),
[security checklist](docs/security-checklist.md), [threat model](docs/threat-model.md),
[disaster recovery](docs/disaster-recovery.md), [scaling & performance](docs/scaling-and-performance.md),
[observability](docs/observability.md), [API demo script](docs/demo-script.md),
[five-minute product demo script](docs/five-minute-product-demo-script.md),
[implementation plan & requirement checklist](docs/implementation-plan.md).

---

## 1. Quick start (local)

Prerequisites: Node.js ≥ 20, npm ≥ 10, Docker Desktop.

```bash
cd backend
cp .env.example .env            # defaults work for local development
npm install
docker compose up -d postgres   # PostgreSQL 17 on host port 5434 (+ amrutam_test database)
npx prisma migrate deploy       # apply migrations
npm run db:seed                 # admin, 3 verified doctors with slots, 2 patients
npm run start:dev               # http://localhost:3000, Swagger UI at /docs
```

Seeded logins (password `Password123!`): `admin@amrutam.local`, `dr.meera@amrutam.local`,
`dr.arjun@amrutam.local`, `dr.sunita@amrutam.local`, `patient@amrutam.local`, `patient2@amrutam.local`.

> The database is published on **5434**, not 5432, so it never collides with a PostgreSQL
> installed natively on the machine. Change it with `POSTGRES_PORT=5432 docker compose up -d postgres`
> and update `DATABASE_URL`.

### Run everything in Docker

```bash
docker compose --profile app up --build        # API on :3000, runs migrations on start
docker compose --profile observability up -d   # Prometheus :9090, Grafana :3001 (admin/admin), Jaeger :16686
```

## 2. Commands

| Command | What it does |
|---|---|
| `npm run start:dev` | Dev server with reload |
| `npm run build` / `npm start` | Compile to `dist/` and run |
| `npm run lint` / `npm run format` / `npm run typecheck` | ESLint (type-aware), Prettier, `tsc --noEmit` |
| `npm test` | Unit tests (`src/**/*.spec.ts`) |
| `npm run test:e2e` | Integration tests against the real `amrutam_test` database |
| `npm run test:cov` | Unit tests with coverage |
| `npm run prisma:migrate` | Create/apply a migration in development (`prisma migrate dev`) |
| `npm run prisma:deploy` | Apply migrations (production / CI) |
| `npm run db:seed` | Seed development data (idempotent) |
| `npm run db:reset` | Drop, re-migrate and re-seed the dev database |
| `npm run prisma:studio` | Browse data |
| `npm run openapi:generate` | Write `docs/openapi.json` |

## 3. Environment variables

All variables are validated at startup (`src/config/env.validation.ts`); the process refuses to boot
with a clear message if one is invalid. See [`.env.example`](.env.example) for the full list.

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | yes | `development` / `test` / `production` |
| `PORT` | no | default `3000` |
| `DATABASE_URL` | yes | `postgresql://…` |
| `CORS_ORIGIN` | yes | Explicit frontend origin(s), comma-separated |
| `JWT_ACCESS_SECRET` | yes | ≥ 32 chars. `openssl rand -base64 48` |
| `JWT_ACCESS_TTL` | no | default `15m` |
| `REFRESH_TOKEN_TTL_DAYS` | no | default `30` |
| `MFA_ENCRYPTION_KEY` | yes | 64 hex chars (AES-256 key for TOTP secrets). `openssl rand -hex 32` |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | no | Empty ⇒ **mock** payment provider |
| `RATE_LIMIT_TTL_SECONDS` / `RATE_LIMIT_MAX` | no | Global limiter (auth endpoints: 10/min fixed) |
| `IDEMPOTENCY_TTL_HOURS` | no | default `24` |
| `NOTIFICATION_WORKER_ENABLED` / `NOTIFICATION_POLL_INTERVAL_MS` | no | In-process job worker |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | no | e.g. `http://localhost:4318/v1/traces`; empty ⇒ tracing off |
| `SWAGGER_ENABLED` | no | Swagger UI at `/docs` (never in production) |

## 4. Database and migrations

- Schema: [`prisma/schema.prisma`](prisma/schema.prisma); relationships and constraints are explained in
  [`docs/erd.md`](docs/erd.md).
- Migrations live in `prisma/migrations/`. Two are hand-written SQL because Prisma cannot express them:
  check constraints (`…_add_check_constraints`) and the **partial unique index** that guarantees at most
  one non-cancelled consultation per slot (`…_active_consultation_slot_partial_unique`).
- Development: edit the schema, run `npm run prisma:migrate -- --name <change>`.
- Production: `npm run prisma:deploy` before starting the new version (the compose `api` service and the
  Terraform example do this).

## 5. Tests

```bash
npm test          # 58 unit tests: state machine, retry/backoff, crypto, env validation, auth, booking, payments, prescriptions
npm run test:e2e  # 69 integration tests against PostgreSQL (needs docker compose postgres)
```

Integration suites (`test/*.e2e-spec.ts`) boot the real `AppModule` against `amrutam_test`, truncate
tables per file, and cover: auth (register/login/refresh rotation + reuse detection/logout/RBAC/MFA),
validation and error format, booking success + cancellation, **12 concurrent patients racing for one slot
(exactly one wins)**, **parallel idempotent retries (one booking)**, idempotency replay/mismatch/scoping,
consultation state transitions, prescription access control, payment event idempotency, audit logs,
analytics, availability management, notification worker retries, rate limiting, health/metrics.

The global setup refuses to run against a database whose name does not end in `_test`.

## 6. Payments

- With `STRIPE_SECRET_KEY` set, `POST /payments/intents` creates a Stripe **PaymentIntent** (idempotency
  key = our payment id) and returns its `clientSecret` for the frontend (Stripe.js / Payment Element).
  Status changes arrive through `POST /payments/webhook` (signature verified, de-duplicated by event id).
  The frontend also calls `POST /payments/:id/sync` right after the customer confirms, which reads the
  PaymentIntent back from Stripe and records the result immediately, so local development works without a
  webhook tunnel; the webhook remains the durable path in production.
  Point the Stripe CLI at it locally: `stripe listen --forward-to localhost:3000/payments/webhook` and put the
  printed `whsec_…` signing secret in `STRIPE_WEBHOOK_SECRET` (a `pk_…` publishable key is **not** a webhook secret; the app warns at boot).
- Without it, the **mock provider** is active: no money moves, and `POST /payments/:id/mock-confirm`
  simulates the provider callback. The mock endpoint returns 404 when Stripe is configured.
- Card data never touches this backend. See [`docs/architecture.md`](docs/architecture.md#payments).

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| `P1000 Authentication failed` on migrate | Another PostgreSQL owns the port. Use the compose DB on 5434 (default `.env`) or change `POSTGRES_PORT`. |
| `Invalid environment configuration` at boot | Read the listed variable; `.env.example` shows the expected format. |
| `429 Too Many Requests` while testing auth | Auth endpoints allow 10 requests/min per IP. Wait or set `RATE_LIMIT_DISABLED=true` (tests only). |
| `409 Consultation cannot start until payment has succeeded` | Create an intent and confirm it (Stripe) or call `mock-confirm` (mock). |
| e2e tests fail with `Refusing to run … _test` | `.env.test` / `TEST_DATABASE_URL` must point at a database named `*_test`. |
| Swagger returns 404 | `SWAGGER_ENABLED=true` and `NODE_ENV!=production`. |
| Webhook returns 404 | The mock provider is active; set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. |
| Webhook returns 400 `Invalid Stripe webhook signature` | `STRIPE_WEBHOOK_SECRET` must be the `whsec_…` signing secret for this endpoint (Stripe CLI or Dashboard → Webhooks). |
| Tests use Stripe instead of the mock | They should never: `.env.test` blanks the Stripe keys and `test/setup-env.ts` loads it with override. |

## 8. Project layout

```
src/
  main.ts              bootstrap: helmet, CORS, validation, Swagger, graceful shutdown
  app.module.ts        module wiring + global guards/filters/interceptors
  config/              env validation, typed config service
  common/              decorators, guards (JWT, roles), exception filter, idempotency, crypto, retry
  prisma/              PrismaService
  observability/       OpenTelemetry bootstrap, Prometheus metrics
  modules/
    auth users doctors availability bookings consultations prescriptions
    payments audit-logs admin notifications health
test/                  integration tests + helpers
prisma/                schema, migrations, seed
observability/         Prometheus config, Grafana provisioning + dashboard
infra/terraform/       AWS ECS Fargate + RDS reference deployment
load/                  k6 load-test script
docs/                  architecture and operations documentation
```
