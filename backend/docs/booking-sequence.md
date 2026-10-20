# Booking sequence

```mermaid
sequenceDiagram
    autonumber
    participant P as Patient (frontend)
    participant G as Guards / Pipes
    participant I as IdempotencyInterceptor
    participant B as BookingsService
    participant DB as PostgreSQL
    participant W as NotificationWorker

    P->>G: POST /auth/login
    G-->>P: accessToken (15m) + refreshToken

    P->>G: GET /doctors?specialization=Ayurveda&availableOnly=true
    G-->>P: paginated verified doctors
    P->>G: GET /doctors/:id/availability
    G-->>P: AVAILABLE future slots

    P->>G: POST /bookings {doctorId, slotId}  (Authorization, Idempotency-Key)
    G->>G: rate limit → JWT (re-read user) → role PATIENT → validate DTO
    G->>I: handler
    I->>DB: INSERT idempotency_records(user_id, key, request_hash)
    alt key already exists
        DB-->>I: unique violation
        I->>DB: SELECT record
        alt completed & same hash
            I-->>P: replay stored status/body (Idempotent-Replayed: true)
        else different hash
            I-->>P: 422 key reused with different payload
        else still in progress
            I-->>P: 409 request in progress
        end
    else new key
        I->>B: create(patient, dto)
        B->>DB: SELECT doctor (VERIFIED, ACTIVE), SELECT slot (future)
        B->>DB: BEGIN
        B->>DB: UPDATE availability_slots SET status='BOOKED' WHERE id=$1 AND status='AVAILABLE'
        alt 0 rows (another transaction won)
            B->>DB: ROLLBACK
            B-->>I: ConflictException
            I->>DB: DELETE idempotency record (client may retry)
            I-->>P: 409 Slot is no longer available
        else 1 row
            B->>DB: INSERT consultations (SCHEDULED) + payments (PENDING)
            Note over DB: partial unique index consultations(slot_id) WHERE status<>'CANCELLED'<br/>is the database-level backstop
            B->>DB: INSERT audit_logs (booking.created)
            B->>DB: INSERT notification_jobs ×2 (patient, doctor)
            B->>DB: COMMIT
            B-->>I: consultation view
            I->>DB: UPDATE idempotency_records SET status_code, response_body, completed_at
            I-->>P: 201 Created {consultation, payment: PENDING}
        end
    end

    W->>DB: poll notification_jobs WHERE status='PENDING' AND next_run_at<=now()
    W->>DB: UPDATE … SET status='PROCESSING' WHERE id=? AND status='PENDING' (claim)
    W->>W: send (simulated email), retry with backoff+jitter on failure
    W->>DB: UPDATE … SET status='SENT' | 'PENDING'(retry) | 'FAILED'
```

## Rules

| Topic | Rule |
|---|---|
| Transaction boundary | From the slot `UPDATE` to the notification inserts: one PostgreSQL transaction, `READ COMMITTED`. |
| Concurrency | Row lock on the slot serialises writers; loser matches zero rows → 409. Partial unique index on `consultations.slot_id` is the backstop. |
| Rollback | Any exception inside the callback rolls back all rows. Nothing partial can be observed. |
| Retries (server) | None for booking; it is not idempotent at the SQL level. |
| Retries (client) | Reuse the **same** `Idempotency-Key`. Same payload → replay; different payload → 422. |
| Idempotency retention | `IDEMPOTENCY_TTL_HOURS` (default 24 h); expired records are swept by the worker and ignored if hit. |
| Failed requests | Release the key so a retry re-executes (the failure itself is not cached). |
| Payment | A `payments` row (PENDING) is created with the booking. The patient then calls `POST /payments/intents`; settlement arrives via Stripe webhook or the mock endpoint. |
| Consultation start | Requires `payment.status = SUCCEEDED`. |

## Cancellation

`POST /bookings/:id/cancel` (patient, doctor, admin):

1. Validate access and that the state machine allows `SCHEDULED → CANCELLED`.
2. Transaction: conditional update to `CANCELLED`, release slot to `AVAILABLE` (if still in the future),
   audit row, notification job for the other party.
3. After commit: refund a `SUCCEEDED` payment through the provider (idempotency key `refund_<paymentId>`),
   or void a `PENDING`/`PROCESSING` one. Failures are logged for manual follow-up; the consultation
   stays cancelled (see "Sagas" in `architecture.md`).
