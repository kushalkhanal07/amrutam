# Implementation Plan

This document was produced before implementation started. It maps every
assignment requirement to a concrete location in the codebase, shows the
directory tree, the data model, the API plan, the booking concurrency design,
and the phased build order.

## 1. Requirement checklist

| # | Requirement | Implementation location |
|---|-------------|-------------------------|
| 1 | User lifecycle, authentication, roles | `src/modules/auth`, `src/modules/users`, `prisma/schema.prisma` (`User`, `Profile`, `RefreshToken`) |
| 2 | Doctor profiles and availability | `src/modules/doctors`, `src/modules/availability` |
| 3 | Doctor search and filtering | `src/modules/doctors/doctors.service.ts` (`search`), indexes on `Doctor` |
| 4 | Appointment booking and cancellation | `src/modules/bookings` (conditional update inside one transaction) |
| 5 | Consultation lifecycle | `src/modules/consultations` (`consultation-state.ts` transition table) |
| 6 | Prescriptions and access control | `src/modules/prescriptions` |
| 7 | Payment records and status tracking | `src/modules/payments` (Stripe adapter + mock adapter, webhook dedupe) |
| 8 | Compliance and audit trails | `src/modules/audit-logs` (`AuditService` used inside transactions) |
| 9 | Admin analytics | `src/modules/admin` (aggregate queries) |
| 10 | Rate limiting, validation, idempotency, async jobs | `@nestjs/throttler` in `app.module.ts`, `ValidationPipe` in `main.ts`, `src/common/idempotency`, `src/modules/notifications` (DB-backed job queue + worker) |
| 11 | Tests, CI/CD, containers, observability, docs | `src/**/*.spec.ts`, `test/*.e2e-spec.ts`, `.github/workflows/ci.yml`, `Dockerfile`, `docker-compose.yml`, `src/observability`, `docs/` |
| S1 | Argon2id password hashing | `src/modules/auth/password.service.ts` |
| S2 | Refresh-token rotation and revocation | `src/modules/auth/auth.service.ts`, `RefreshToken` model (hash only) |
| S3 | RBAC | `src/common/guards/roles.guard.ts`, `@Roles()` decorator |
| S4 | Object-level authorization | enforced in each service (`assertCanView...` helpers) |
| S5 | MFA | TOTP in `src/modules/auth/mfa.service.ts`; scoped to doctor/admin accounts, documented in `docs/security-checklist.md` |
| S6 | Safe error responses | `src/common/filters/http-exception.filter.ts` |
| S7 | Rate limiting on auth endpoints | `@Throttle()` on `AuthController` |
| S8 | CORS and secure headers | `main.ts` (`helmet`, explicit `CORS_ORIGIN`) |
| S9 | Env validation | `src/config/env.validation.ts` |
| S10 | Encryption at rest strategy | `docs/security-checklist.md`, MFA secrets encrypted with AES-256-GCM (`src/common/crypto`) |
| S11 | Dependency scanning | `npm audit` + Trivy in `.github/workflows/ci.yml` |
| S12 | Audit events | `AuditService` calls in auth, users, bookings, consultations, prescriptions, payments |
| O1 | Structured logs with request IDs | `nestjs-pino` in `app.module.ts`, `x-request-id` |
| O2 | Health/readiness | `src/modules/health` |
| O3 | HTTP metrics, latency, errors, DB health | `src/observability/metrics` (`prom-client`), `/metrics` |
| O4 | OpenTelemetry traces | `src/observability/tracing.ts` (loaded before Nest bootstraps) |
| O5 | Grafana dashboard | `observability/grafana/dashboards/amrutam-api.json` |
| O6 | Graceful shutdown | `main.ts` (`enableShutdownHooks`), `PrismaService.onModuleDestroy`, worker stop |
| O7 | Timeouts and bounded retries with jitter | `src/common/utils/retry.ts`, Stripe client `timeout`, worker backoff |
| O8 | Backup/DR/partitioning | `docs/disaster-recovery.md`, `docs/scaling-and-performance.md` |
| I1 | Dockerfile non-root | `Dockerfile` |
| I2 | docker-compose with Postgres (no Redis, by request) | `docker-compose.yml` |
| I3 | Migrations and seed | `prisma/migrations`, `prisma/seed.ts` |
| I4 | Terraform example | `infra/terraform` (AWS ECS Fargate + RDS) |
| D1 | Documentation | `README.md`, `docs/*.md` |
| L1 | Load test plan | `docs/scaling-and-performance.md`, `load/k6-booking.js` |

## 2. Directory tree

```
backend/
  .github/workflows/ci.yml
  Dockerfile
  docker-compose.yml
  .env.example
  package.json
  tsconfig.json / tsconfig.build.json
  nest-cli.json
  eslint.config.mjs / .prettierrc
  jest.config.ts / test/jest-e2e.json
  prisma/
    schema.prisma
    migrations/
    seed.ts
  src/
    main.ts
    app.module.ts
    config/            env validation and typed config
    common/            decorators, guards, filters, interceptors, dto, utils, crypto
    prisma/            PrismaModule + PrismaService
    observability/     tracing.ts, metrics module
    modules/
      auth/            register, login, refresh, logout, MFA
      users/           me, profile, admin role changes
      doctors/         profile CRUD, search
      availability/    slot management
      bookings/        book + cancel
      consultations/   lifecycle transitions, video boundary
      prescriptions/   create + read with access control
      payments/        Stripe adapter, mock adapter, webhooks
      audit-logs/      AuditService + admin read endpoint
      admin/           analytics
      notifications/   job queue + worker
      health/          /health and /ready
  test/                integration tests (real PostgreSQL)
  load/                k6 load test scripts
  observability/       prometheus.yml, grafana provisioning
  infra/terraform/     example AWS deployment
  docs/                architecture, ERD, sequence, security, DR, scaling, observability, demo
```

## 3. Data model (summary)

See `prisma/schema.prisma` and `docs/erd.md`. Key constraints:

- All primary keys are UUIDs generated in the database (`gen_random_uuid()`).
- `User.email` unique; `RefreshToken.tokenHash` unique (raw token never stored).
- `AvailabilitySlot` unique on `(doctorId, startsAt)`; check constraint `endsAt > startsAt`.
- Partial unique index `consultations(slot_id) WHERE status <> 'CANCELLED'`: the database itself forbids two live consultations on one slot, while a cancelled one releases it.
- `Payment.consultationId` unique; `PaymentEvent.providerEventId` unique (webhook dedupe).
- `IdempotencyRecord` unique on `(userId, key)`.
- Money stored as integer minor units (`amountMinor`) plus ISO currency code.
- All timestamps are `timestamptz`, stored in UTC.

## 4. API endpoint plan

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| POST | /auth/register | public | rate limited |
| POST | /auth/login | public | returns tokens or `mfaRequired` |
| POST | /auth/mfa/verify | public | completes MFA login |
| POST | /auth/refresh | public | rotation + reuse detection |
| POST | /auth/logout | any | revokes refresh token |
| POST | /auth/mfa/setup, /auth/mfa/enable, /auth/mfa/disable | doctor, admin | TOTP |
| GET/PATCH | /users/me | any | profile |
| GET | /users | admin | paginated |
| PATCH | /users/:id/role, /users/:id/status | admin | audited |
| GET | /doctors | public | search + filters + pagination |
| GET | /doctors/:id | public | |
| POST/PATCH | /doctors/me | doctor | create/update own profile |
| PATCH | /doctors/:id/verification | admin | |
| GET | /doctors/:id/availability | public | available future slots |
| POST | /availability | doctor | create slots |
| DELETE | /availability/:id | doctor | only if not booked |
| POST | /bookings | patient | `Idempotency-Key` required |
| GET | /bookings/:id | owner/admin | |
| POST | /bookings/:id/cancel | patient, doctor, admin | |
| GET | /consultations | patient, doctor, admin | own list |
| GET | /consultations/:id | owner/admin | |
| POST | /consultations/:id/start, /complete, /no-show | doctor | state machine |
| POST | /prescriptions | doctor | consultation must be in progress or completed |
| GET | /prescriptions/:id | owner/admin | |
| GET | /consultations/:id/prescription | owner/admin | |
| POST | /payments/intents | patient | creates Stripe PaymentIntent (or mock) |
| GET | /payments/:id | owner/admin | |
| POST | /payments/webhook | public (signature) | Stripe webhook, deduplicated |
| POST | /payments/:id/mock-confirm | patient | only when mock provider active |
| GET | /admin/analytics/overview | admin | |
| GET | /admin/analytics/doctors | admin | utilization |
| GET | /admin/audit-logs | admin | paginated, filterable |
| GET | /health, /ready, /metrics | public | |

## 5. Booking concurrency and idempotency design

1. The `Idempotency-Key` header is required on `POST /bookings`.
2. `IdempotencyInterceptor` inserts `(userId, key, requestHash)` into
   `IdempotencyRecord`. The unique constraint means only one request can own a key.
   - Existing record with a stored response and same hash: return the stored response.
   - Existing record with a different hash: `422 Unprocessable Entity`.
   - Existing record without a response (first request still running): `409 Conflict`.
3. Inside one PostgreSQL transaction (`READ COMMITTED` is sufficient):
   - `UPDATE availability_slots SET status='BOOKED' WHERE id=$1 AND status='AVAILABLE'`.
     The row lock serialises competing writers; the second writer re-evaluates the
     `WHERE` clause after the first commits and matches zero rows, so it fails.
   - Zero rows updated -> throw `409`, transaction rolls back.
   - Insert `Consultation` (the partial unique index on `slotId` is a second, database-level guard).
   - Insert `Payment` (PENDING), `AuditLog`, and `NotificationJob` (outbox).
4. The transaction either commits everything or nothing. Booking and audit event
   are therefore always consistent.
5. The notification worker polls `NotificationJob` outside the transaction and
   retries with exponential backoff and jitter, bounded by `maxAttempts`.
6. Idempotency records are retained for 24 hours and swept by the worker.
7. No application-level retries for booking: it is not idempotent at the DB
   level. Clients retry with the same key and get the original result.

## 6. Phased implementation plan

1. Project setup: package.json, TypeScript, lint, Jest, Nest skeleton, env validation.
2. Database: Prisma schema, migration, seed.
3. Authentication: register, login, refresh rotation, logout, RBAC, MFA.
4. Doctors, search, availability.
5. Booking: idempotency interceptor, transactional slot claim, cancellation.
6. Consultations and prescriptions.
7. Payments (Stripe + mock) and admin analytics/audit logs.
8. Tests: unit and integration (including concurrency and idempotency).
9. Observability: logging, metrics, tracing, Grafana dashboard.
10. Infrastructure: Dockerfile, compose, CI, Terraform example.
11. Documentation.
