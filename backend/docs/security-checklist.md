# Security checklist

Legend: ✅ implemented · 📄 documented/operational (outside the code) · ⚠️ partial / follow-up

## Authentication & sessions
- ✅ Passwords hashed with **Argon2id** (19 MiB, t=2, p=1) — `auth/password.service.ts`. Hashes never returned.
- ✅ Access tokens: HS256 JWT, 15 min, issuer-checked, `type: access` claim.
- ✅ Refresh tokens: 48 random bytes, **only SHA-256 hash stored**, 30-day expiry, rotated on every use,
  family-based **reuse detection** revokes all tokens in the family and audits `auth.refresh.reuse_detected`.
- ✅ Logout revokes the family; admin suspension revokes all sessions and the JWT guard re-reads
  `users.status` on every request, so revocation is immediate.
- ✅ Uniform "Invalid email or password" message; login failures audited with reason (no password).
- ✅ **MFA (TOTP, RFC 6238)** for DOCTOR and ADMIN accounts: setup → enable (code verified) → login
  returns a 5-minute `mfaToken` challenge → `/auth/mfa/verify`. Secrets encrypted at rest with
  AES-256-GCM (`MFA_ENCRYPTION_KEY`). Scope: optional per account; enforcing it for all admins is a
  one-line policy change in `AuthService.login` (⚠️ not enforced by default; recovery codes not implemented).
- ✅ Admin accounts cannot self-register.

## Authorization
- ✅ Global `JwtAuthGuard` (deny by default, `@Public()` opt-out) + `RolesGuard`.
- ✅ Object-level checks in services for consultations, bookings, prescriptions, payments, slots.
- ✅ Server never trusts ids/roles from the body: patient id comes from the token; `patientId` in a body is rejected by whitelist validation.
- ✅ Role embedded in the token is ignored in favour of the database row.

## Input handling
- ✅ `ValidationPipe` with `whitelist` + `forbidNonWhitelisted` + `transform`; DTOs bound with class-validator.
- ✅ UUID params validated; pagination capped at 100; date ranges capped (31 days for slots, 366 for analytics).
- ✅ Prisma parameterised queries only (no string-built SQL from input).
- ✅ Error filter returns a stable envelope; stack traces, SQL and Prisma messages are logged, never returned.

## Transport & headers
- ✅ `helmet()` defaults: HSTS, `X-Content-Type-Options`, frame denial, CSP, referrer policy.
- ✅ CORS restricted to `CORS_ORIGIN` (explicit list), credentials allowed, headers whitelisted.
- 📄 HTTPS terminates at the load balancer (Terraform: ALB TLS 1.3 policy); `trust proxy` enabled in production.

## Rate limiting & abuse
- ✅ Global limiter (`RATE_LIMIT_MAX`/`RATE_LIMIT_TTL_SECONDS`, default 120/min per IP).
- ✅ Auth endpoints (register, login, MFA verify, refresh): 10/min per IP.
- ✅ Health/metrics excluded. Verified in `test/rate-limit.e2e-spec.ts`.
- ⚠️ In-memory counters per instance; with many replicas enforce limits additionally at the load balancer / WAF.

## Secrets & configuration
- ✅ All secrets from environment; validated at boot; `.env.example` contains placeholders only; `.env*` git-ignored.
- ✅ Logs redact `authorization`, `cookie`, `stripe-signature`; bodies are never logged.
- 📄 Production: AWS Secrets Manager injected into ECS tasks (Terraform example).

## Data protection
- ✅ No raw passwords, no plaintext refresh tokens, no card numbers/CVVs (Stripe client-side confirmation only).
- ✅ Audit metadata restricted to ids, statuses and counts; prescription content and doctor notes never appear in logs or audit rows (asserted by tests).
- ✅ Public doctor listing exposes name/specialization only, never emails.
- 📄 **Encryption at rest strategy:**
  1. *Volume level:* RDS storage encryption (AES-256, KMS) and encrypted snapshots — covers all tables.
  2. *Field level:* MFA secrets are additionally encrypted in the application (AES-256-GCM) so a database
     dump alone cannot be used to generate codes. The same `SecretBox` helper can wrap `doctor_notes`
     and prescription text if a stricter classification requires it (trade-off: no server-side search).
  3. *Backups:* encrypted with the same KMS key; key rotation yearly; access via IAM only.
  4. *Transit:* TLS to the database (`sslmode=require` in production `DATABASE_URL`).

## Payments
- ✅ Stripe webhook signature verification (`constructEvent` on the raw body); events de-duplicated by `provider_event_id`.
- ✅ Idempotency keys on Stripe requests; refunds keyed per payment.
- ✅ Mock provider clearly labelled; `mock-confirm` endpoint disabled when Stripe is configured; "no real payment processed" is never claimed.

## Audit & compliance
- ✅ Audit events: register, login success/failure, MFA enable/disable/failure, refresh reuse, logout, role change,
  status change, doctor verification, booking created/cancelled, consultation status changes, prescription created,
  payment intent created, payment status changed.
- ✅ Each row: actor, role, action, entity, ip, user agent, request id, timestamp. Written inside the business transaction where one exists.
- ✅ Admin-only, paginated, filterable read endpoint.

## Supply chain & CI
- ✅ Pinned dependency versions; `npm ci` in CI.
- ✅ `npm audit --audit-level=high` (prod deps) and Trivy filesystem + image scans in `.github/workflows/ci.yml`.
- ✅ Non-root container user, minimal Alpine runtime, `dumb-init` for signal handling.

## Follow-ups (not in scope of this iteration)
- ⚠️ Enforce MFA for all admins; add recovery codes.
- ⚠️ Load-balancer / WAF level rate limiting for multi-instance deployments.
- ⚠️ Field-level encryption for clinical text, if the data classification requires it.
- ⚠️ Account lockout / progressive delays after repeated failures (currently rate-limit only).
