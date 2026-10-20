# API reference

The complete, generated OpenAPI 3 specification is in [`openapi.json`](openapi.json)
(regenerate with `npm run openapi:generate`). In development, Swagger UI is served at
`http://localhost:3000/docs` and the raw JSON at `/docs-json`.

## Conventions

- **Auth:** `Authorization: Bearer <accessToken>`. Access tokens expire after 15 minutes; use
  `POST /auth/refresh` with the refresh token to rotate both.
- **Roles:** `PATIENT`, `DOCTOR`, `ADMIN`. Object-level checks apply on top (owners only).
- **Pagination:** `?page=1&limit=20` (max 100). Response: `{ items, total, page, limit, totalPages }`.
- **Dates:** ISO 8601 strings in UTC (`2026-11-01T09:00:00.000Z`).
- **Money:** integer minor units + ISO currency (`amountMinor: 50000, currency: "INR"` = ₹500.00).
- **Idempotency:** `POST /bookings` requires `Idempotency-Key` (≤128 chars, UUID recommended).
  Replays carry `Idempotent-Replayed: true`.
- **Correlation:** every response has `X-Request-Id` (echoed if supplied).

### Error envelope

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "Slot is no longer available",
  "requestId": "d4c5f1d0-…",
  "path": "/bookings",
  "timestamp": "2026-10-19T13:45:05.157Z"
}
```

Validation errors return `400` with `message` as an array of field messages. Unknown body fields are
rejected (`property x should not exist`).

| Status | Meaning |
|---|---|
| 400 | Validation / malformed id / missing `Idempotency-Key` |
| 401 | Missing, expired or revoked token; wrong credentials; MFA failure |
| 403 | Role or object-level authorization failure; suspended account |
| 404 | Unknown resource (also used to avoid leaking unverified doctors) |
| 409 | State conflict: slot taken, invalid transition, duplicate, idempotent request in progress |
| 422 | `Idempotency-Key` reused with a different payload |
| 429 | Rate limited (`Retry-After` header) |
| 503 | Payment provider unavailable / readiness failed |

## Endpoints

### Auth `/auth`
| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/auth/register` | public (10/min) | Register PATIENT (default) or DOCTOR. Returns token pair. |
| POST | `/auth/login` | public (10/min) | Token pair, or `{ mfaRequired: true, mfaToken }` |
| POST | `/auth/mfa/verify` | public (10/min) | `{ mfaToken, code }` → token pair |
| POST | `/auth/refresh` | public (10/min) | Rotate refresh token; reuse revokes the family |
| POST | `/auth/logout` | any | Revoke the refresh token family (204) |
| POST | `/auth/mfa/setup` | DOCTOR, ADMIN | Returns `secret` + `otpauthUrl` once |
| POST | `/auth/mfa/enable` | DOCTOR, ADMIN | `{ code }` (204) |
| POST | `/auth/mfa/disable` | DOCTOR, ADMIN | `{ code }` (204) |

### Users `/users`
| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/users/me` | any | Current user + profile (never includes hashes/secrets) |
| PATCH | `/users/me` | any | Update profile |
| GET | `/users` | ADMIN | List users (`role`, `status` filters) |
| GET | `/users/:id` | ADMIN | |
| PATCH | `/users/:id/role` | ADMIN | `{ role }` — audited |
| PATCH | `/users/:id/status` | ADMIN | `{ status }` — suspension revokes sessions, audited |

### Doctors `/doctors`
| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/doctors` | public | Search verified doctors: `specialization`, `q`, `language`, `maxFeeMinor`, `minExperience`, `availableOnly`, `availableFrom`, `availableTo`, `sortBy` (`fee|experience|rating|createdAt`), `sortDir`, `page`, `limit` |
| GET | `/doctors/:id` | public | Public profile |
| GET | `/doctors/:id/availability` | public | AVAILABLE slots in `[from, to]` (default next 14 days, max 31) |
| GET | `/doctors/me` | DOCTOR | Own profile |
| POST | `/doctors/me` | DOCTOR | Create profile (PENDING verification) |
| PATCH | `/doctors/me` | DOCTOR | Update profile |
| PATCH | `/doctors/:id/verification` | ADMIN | `{ status: VERIFIED|REJECTED|PENDING }` — audited |

### Availability `/availability` (DOCTOR)
| Method | Path | Description |
|---|---|---|
| GET | `/availability?from&to` | Own slots, all statuses |
| POST | `/availability` | `{ slots: [{ startsAt, endsAt }] }` (≤100, no overlaps, future, ≤4 h) |
| POST | `/availability/generate` | `{ from, to, durationMinutes }` → equal slots |
| POST | `/availability/:id/block` / `unblock` | Toggle BLOCKED |
| DELETE | `/availability/:id` | Delete if not BOOKED (204) |

### Bookings `/bookings`
| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/bookings` | PATIENT + `Idempotency-Key` | `{ doctorId, slotId, mode?, reasonForVisit? }` → 201 consultation (SCHEDULED) with `payment` (PENDING) |
| GET | `/bookings/:id` | owner / ADMIN | Alias of `GET /consultations/:id` |
| POST | `/bookings/:id/cancel` | patient, doctor, ADMIN | `{ reason? }` → CANCELLED; slot released; payment refunded/voided |

### Consultations `/consultations`
| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/consultations` | any | Own consultations (admins: all). Filters `status`, `from`, `to` |
| GET | `/consultations/:id` | owner / ADMIN | Includes payment summary, prescription id |
| GET | `/consultations/:id/prescription` | owner / ADMIN | |
| POST | `/consultations/:id/start` | consulting DOCTOR | SCHEDULED → IN_PROGRESS (requires SUCCEEDED payment); returns simulated `video.joinUrl` |
| POST | `/consultations/:id/complete` | consulting DOCTOR | IN_PROGRESS → COMPLETED, `{ doctorNotes? }` |
| POST | `/consultations/:id/no-show` | consulting DOCTOR | SCHEDULED → NO_SHOW (after start time) |

### Prescriptions `/prescriptions`
| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/prescriptions` | consulting DOCTOR | `{ consultationId, diagnosis, instructions?, validUntil?, items[] }`; consultation must be IN_PROGRESS/COMPLETED; one per consultation |
| GET | `/prescriptions` | any | Own prescriptions (patient: received, doctor: issued, admin: all) |
| GET | `/prescriptions/:id` | patient owner / issuing doctor / ADMIN | |

### Payments `/payments`
| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/payments/intents` | PATIENT (owner) | `{ consultationId }` → `{ paymentId, provider, providerPaymentId, clientSecret, amountMinor, currency }`. Re-uses an open intent; 409 if already paid |
| GET | `/payments/:id` | owner / ADMIN | Status, never card data |
| POST | `/payments/:id/sync` | owner / ADMIN | Reconcile with the provider: reads the intent back and records success/cancellation (idempotent) |
| POST | `/payments/webhook` | public (Stripe signature) | Stripe events; 404 under mock provider |
| POST | `/payments/:id/mock-confirm` | PATIENT (owner) | `{ outcome: succeeded|failed }` — **mock provider only**, 404 when Stripe is configured |

### Admin `/admin`
| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/admin/analytics/overview?from&to` | ADMIN | Bookings by status, cancellations, slot utilization, new users, payments by status, gross revenue by currency |
| GET | `/admin/analytics/doctors?from&to&page&limit` | ADMIN | Per-doctor utilization and outcomes |
| GET | `/admin/audit-logs` | ADMIN | Filters: `action`, `entityType`, `entityId`, `actorId`, `from`, `to`; paginated |

### Operations
| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness (no dependencies) |
| GET | `/ready` | Readiness (database ping) |
| GET | `/metrics` | Prometheus exposition |
| GET | `/docs`, `/docs-json` | Swagger UI / OpenAPI (non-production) |
