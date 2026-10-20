# Threat model

## Scope and assets

| Asset | Classification | Where |
|---|---|---|
| Patient identity (name, email, phone, DOB) | Personal data (PII) | `users`, `profiles` |
| Clinical data: diagnosis, prescriptions, doctor notes, reason for visit | **Sensitive health data** | `consultations`, `prescriptions`, `prescription_items` |
| Credentials: password hashes, refresh-token hashes, MFA secrets | Secret | `users`, `refresh_tokens` |
| Payment records (amounts, Stripe references) | Financial | `payments`, `payment_events` — **no card data stored** |
| Audit trail | Integrity-critical | `audit_logs` |
| Application secrets (JWT secret, Stripe keys, DB credentials, MFA key) | Secret | environment / secrets manager |

## Attack surfaces

1. Public HTTP API (auth, doctor search, availability, Stripe webhook).
2. Authenticated API (every role).
3. Database (network reachable only from API tasks).
4. Third-party inbound: Stripe webhooks.
5. Third-party outbound: Stripe API, future email/SMS/video providers.
6. CI/CD pipeline and container images.
7. Operators (admin role, database administrators).

## Threats and mitigations (STRIDE)

| # | Threat | Category | Mitigation | Residual risk |
|---|---|---|---|---|
| T1 | Credential stuffing / brute force on `/auth/login` | Spoofing | Argon2id, 10 req/min/IP on auth routes, uniform error, login failures audited | Distributed attacks across many IPs; add CAPTCHA/lockout |
| T2 | Stolen access token | Spoofing | 15-minute lifetime; user re-validated per request (suspension immediate) | Token valid until expiry; keep TTL short |
| T3 | Stolen / replayed refresh token | Spoofing | Rotation + family reuse detection revokes all sessions; only hashes stored | Attacker who uses the token *first* gets one rotation until the victim's next refresh triggers detection |
| T4 | Privilege escalation via body/role claims | Tampering | Whitelist validation rejects unknown fields; role read from DB; admin-only role changes audited | — |
| T5 | IDOR: reading another patient's consultation/prescription/payment | Information disclosure | Object-level checks in every service; tests for cross-user access (403) | New endpoints must follow the pattern (code review item) |
| T6 | Doctor issues prescription for a consultation they did not conduct | Elevation | `consultation.doctor.userId === user.id` check; status must be IN_PROGRESS/COMPLETED | — |
| T7 | Double booking via concurrent requests | Tampering / integrity | Conditional update in transaction + partial unique index; concurrency tests | — |
| T8 | Duplicate charge via retried requests | Integrity | `Idempotency-Key` on bookings; Stripe idempotency keys; payment-event dedupe | — |
| T9 | Forged Stripe webhook marks payments paid | Spoofing | Signature verification with `STRIPE_WEBHOOK_SECRET`; mock endpoint disabled with Stripe; events must map to a known `provider_payment_id` | Secret leakage ⇒ rotate secret |
| T10 | Replayed Stripe webhook | Repudiation / integrity | Unique `provider_event_id`; status never regresses | — |
| T11 | Sensitive data in logs | Information disclosure | Bodies never logged; header redaction; audit metadata restricted to ids; tests assert absence of clinical text | Developer adds a `console.log` — lint/code review |
| T12 | SQL injection | Tampering | Prisma parameterised queries; only one raw query (`SELECT 1`) and a test-only truncate | — |
| T13 | XSS / clickjacking against a browser client | Tampering | Helmet CSP/frame headers; API returns JSON only; CORS limited to the frontend origin | Frontend's own responsibility |
| T14 | Denial of service through expensive queries | DoS | Pagination caps, bounded date ranges, slot generation limits, global rate limit, DB timeouts on readiness | Large-scale volumetric DoS needs WAF/CDN |
| T15 | Secret leakage via repository | Information disclosure | `.env*` ignored, placeholders only, CI uses secrets store, Terraform uses Secrets Manager | Operator discipline; add secret scanning (gitleaks) |
| T16 | Vulnerable dependency | Tampering | Pinned versions, `npm audit`, Trivy image + fs scans in CI | Zero-days; keep CI scans blocking |
| T17 | Database compromise / backup theft | Information disclosure | RDS encryption at rest, MFA secrets app-encrypted, DB reachable only from API SG, least-privilege DB user | Clinical text readable with DB access — optional field-level encryption |
| T18 | Malicious or careless admin | Repudiation | All admin actions audited with actor/ip/request id; audit table append-only in app (no update/delete endpoints); MFA available for admins | DB-level tampering by DBAs — ship audit logs to immutable storage |
| T19 | Enumeration of doctors' accounts via public search | Information disclosure | Public listing omits emails and account data; unverified doctors hidden (404) | — |
| T20 | Notification worker sends to wrong recipient | Information disclosure | Recipient id written in the same transaction as the event; payload contains ids only, never clinical content | — |

## Trust boundaries

- Browser ↔ API: untrusted input; everything validated; identity from token only.
- API ↔ Stripe: trusted after signature verification (inbound) / TLS + API key (outbound).
- API ↔ Database: trusted network segment; still parameterised queries and least privilege.
- Operators: trusted but audited.

## Out of scope / assumptions

- Frontend security (storage of tokens, CSP of the SPA) is the frontend's responsibility; the API
  supports short-lived access tokens so the frontend can keep the refresh token in memory or an
  HTTP-only cookie proxy.
- Physical and cloud-provider security is inherited from AWS.
- Legal/regulatory review (e.g. DPDP Act, HIPAA-like controls) is outside this document; the data
  classification above is the input to that review.
