# Architecture

## 1. Overview

The backend is a **modular monolith**: one NestJS process, one PostgreSQL database, clearly separated
modules wired through dependency injection. A monolith is the right shape at this stage: every core
workflow (booking, consultation, prescription, payment bookkeeping) is a single-database transaction,
and the stated scale (100k consultations/day ≈ 1.2 bookings/s average, perhaps 20–50/s at peak) is
well within what a few horizontally scaled stateless instances and one well-indexed PostgreSQL primary
can handle. Microservices would add network boundaries exactly where we rely on ACID transactions.

```
                 ┌────────────────────────────────────────────────────────┐
  Frontend ───▶  │  NestJS API (stateless, N replicas behind HTTPS LB)     │
  (React etc.)   │  ┌─────────┐ ┌────────┐ ┌─────────────┐ ┌───────────┐ │
                 │  │ Auth    │ │Doctors │ │ Bookings    │ │ Payments  │ │
                 │  │ Users   │ │Availab.│ │ Consultat.  │ │ Admin     │ │
                 │  └─────────┘ └────────┘ │ Prescript.  │ │ AuditLogs │ │
                 │   guards · validation   └─────────────┘ └───────────┘ │
                 │   idempotency · metrics · tracing · pino logs           │
                 │   NotificationWorker (in-process, polls outbox table)   │
                 └───────────────┬───────────────────────────┬────────────┘
                                 │ Prisma                    │ HTTPS
                          ┌──────▼──────┐             ┌──────▼──────┐
                          │ PostgreSQL  │             │ Stripe      │
                          │ (primary)   │             │ (or mock)   │
                          └─────────────┘             └─────────────┘
```

Request pipeline (in order): rate limiter → JWT guard → roles guard → validation pipe → idempotency
interceptor (where declared) → controller → application service → Prisma. Cross-cutting concerns are
global providers in `app.module.ts`.

## 2. Modules and responsibilities

| Module | Responsibility |
|---|---|
| `AuthModule` | Register/login, Argon2id hashing, access JWT (15 min), opaque refresh tokens (hashed, rotated, family-revoked on reuse), TOTP MFA for doctor/admin |
| `UsersModule` | Profile, admin role/status changes (audited; suspension revokes sessions) |
| `DoctorsModule` | Doctor profile, verification, public search with filters/sort/pagination |
| `AvailabilityModule` | Slot creation/generation/blocking/deletion with overlap checks |
| `BookingsModule` | Transactional slot claim + consultation + payment record + audit + outbox; cancellation with refund/void |
| `ConsultationsModule` | Explicit state machine, conditional-update transitions, simulated video provider boundary |
| `PrescriptionsModule` | Creation by the consulting doctor only, read access for patient/doctor/admin |
| `PaymentsModule` | Provider abstraction (`StripePaymentProvider`, `MockPaymentProvider`), intents, webhook de-duplication, refunds |
| `AuditLogsModule` | `AuditService` (writes inside the caller's transaction) + admin read endpoint |
| `NotificationsModule` | Transactional outbox table + polling worker with bounded backoff |
| `AdminModule` | Aggregate analytics (group-by queries only) |
| `HealthModule` / `MetricsModule` | `/health`, `/ready`, `/metrics` |

Controllers only parse input and delegate; all rules live in services. Object-level authorization is
performed in services next to the data it protects (e.g. `ConsultationsService.assertCanAccess`).

## 3. Data flow: booking

See `docs/booking-sequence.md` for the sequence diagram. Summary:

1. Patient authenticates; `JwtStrategy` re-reads the user on every request so suspensions and role
   changes apply immediately (the JWT role claim is never trusted on its own).
2. Patient searches doctors (`GET /doctors`), lists slots (`GET /doctors/:id/availability`).
3. `POST /bookings` with `Idempotency-Key`. The interceptor claims the key by inserting into
   `idempotency_records` (unique `(user_id, key)`).
4. `BookingsService.create` validates doctor/slot, then opens one transaction:
   conditional `UPDATE availability_slots … WHERE status='AVAILABLE'` → insert consultation (+ payment
   PENDING) → audit row → two notification jobs. Zero rows updated ⇒ `409`, everything rolls back.
5. The response is stored on the idempotency record; a retry replays it with `Idempotent-Replayed: true`.
6. The notification worker delivers jobs asynchronously.

## 4. Transaction management

- **Boundaries.** Every multi-row business change is a single `prisma.$transaction(async tx => …)`:
  booking, cancellation, consultation transitions, prescription creation, payment event application,
  role/status/verification changes. Services receive the transaction client so audit rows and outbox
  rows commit atomically with the change.
- **Isolation.** PostgreSQL default `READ COMMITTED` is sufficient because every state change is a
  *conditional update* (`WHERE status = <expected>`) whose row lock serialises competitors; the loser
  re-evaluates the predicate after the winner commits and matches zero rows.
- **Rollback.** Any thrown exception inside the callback rolls the transaction back; the HTTP filter
  maps it to a safe JSON error. For bookings the idempotency record is released on failure so the
  client may retry.
- **External calls stay outside transactions.** Stripe calls (intent creation, refund) happen before or
  after the DB transaction, never inside it, so a slow provider cannot hold locks.

## 5. Concurrency handling

| Hazard | Control |
|---|---|
| Two patients book the same slot | Conditional update on `availability_slots.status` inside the transaction; **plus** a PostgreSQL partial unique index `consultations(slot_id) WHERE status <> 'CANCELLED'` as a database-level backstop. Verified by `test/booking.e2e-spec.ts` (12 concurrent requests, exactly one 201). |
| Duplicate submission / client retry | `Idempotency-Key` + unique `(user_id, key)`; concurrent retries get `409` until the first completes, then a replay. |
| Two doctors/admins change the same consultation | `updateMany({ where: { id, status: from } })` ⇒ `409` for the loser. |
| Duplicate Stripe webhook deliveries | `payment_events.provider_event_id` unique; the insert and the status update share one transaction. |
| Two worker instances take the same job | Conditional claim `UPDATE … WHERE status='PENDING'`. |
| Overlapping slots | Application overlap check + unique `(doctor_id, starts_at)`. |

## 6. Retries, backoff and timeouts

- `withRetry` (`src/common/utils/retry.ts`): exponential backoff with full jitter, bounded attempts,
  and a `shouldRetry` predicate. Used only for idempotent or idempotency-keyed operations: Stripe
  intent creation (keyed by payment id) and refunds (keyed by `refund_<paymentId>`).
- **Never** used around booking or any non-idempotent write; those are retried by the *client* with the
  same `Idempotency-Key`.
- Stripe client has a 10 s request timeout (`STRIPE_TIMEOUT_MS`) and SDK auto-retries disabled so retries
  are explicit. Readiness DB ping has a 2 s timeout.
- Notification worker: attempt N waits `random(0, min(5 min, 1 s·2^N))`; after `maxAttempts` the job is
  `FAILED` and surfaced for manual follow-up.

## 7. Caching

No application cache is used today, deliberately:

- Doctor search and availability are indexed queries that return in single-digit milliseconds at the
  target scale; the correctness cost of stale availability (users booking slots that are gone) is
  higher than the latency gained.
- Everything behind authentication contains personal or medical data and must never be served from a
  shared/public cache. Responses carry no `Cache-Control: public` headers.

When it becomes necessary: cache **only** the public, non-personal doctor search results, first with an
in-process LRU per instance (no new infrastructure), with a short TTL (30–60 s) and explicit invalidation on
doctor profile/verification changes. Availability must stay uncached or use a ≤ 5 s TTL with
invalidation on booking/cancel. Private endpoints: no cache.

## 8. Sagas and the outbox pattern

- **Not used for booking.** Slot claim, consultation, payment record, audit and notification jobs live in
  one database, so one ACID transaction is strictly better than a saga.
- **Outbox (used).** Notifications are written to `notification_jobs` in the same transaction and
  delivered later by the worker: the business change and the "send email" intent cannot diverge.
- **Where a saga is justified:** cancellation of a *paid* consultation spans two systems (our DB and
  Stripe). We run the DB transaction first, then the refund; if the refund fails the payment stays
  `SUCCEEDED` with an error log, and a compensating step (retry refund / manual refund) is required.
  A durable saga/outbox for refund commands is the natural next step if refund failures become common.
  The video provider integration would follow the same pattern.

## 9. Partitioning

Not needed at the stated scale (see `docs/scaling-and-performance.md` for the arithmetic). The tables that
grow without bound (`audit_logs`, `payment_events`, `notification_jobs`) are append-mostly and time-ordered;
when they exceed ~100 M rows or retention jobs become slow, convert them to **range partitions by
`created_at` month** so retention is a `DROP PARTITION`. Business tables stay unpartitioned behind
indexes.

## 10. Backup and disaster recovery

Summarised here; full procedure in `docs/disaster-recovery.md`. Daily automated snapshots + continuous
WAL archiving (RDS PITR), 14-day retention, Multi-AZ standby in production, quarterly restore drills.
Targets: **RPO ≤ 5 min** (PITR), **RTO ≤ 60 min** for a regional database failure.

## 11. Security summary

Argon2id passwords, 15-minute HS256 access tokens, hashed rotated refresh tokens with reuse detection,
RBAC + object-level checks in services, TOTP MFA for privileged roles (secrets AES-256-GCM encrypted),
helmet headers, explicit CORS origin, global + per-endpoint rate limits, whitelist validation that
rejects unknown fields, safe error envelope, audit trail, secrets from environment only. Details and the
encryption-at-rest strategy: `docs/security-checklist.md`, `docs/threat-model.md`.

## 12. What is simulated

| Boundary | Status |
|---|---|
| Payments | Real Stripe integration when configured; otherwise an explicitly labelled mock. No real payment is ever claimed. |
| Video calls | `VideoProvider` abstraction with `SimulatedVideoProvider` (generates a join URL). No media server. |
| Email/SMS | `NotificationSender` logs masked recipients. Replace with SES/Twilio adapter. |
| Redis / message broker | Not used, by design. Async work goes through the PostgreSQL outbox table. |
