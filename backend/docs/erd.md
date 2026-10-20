# Entity relationship diagram

```mermaid
erDiagram
    USER ||--o| PROFILE : has
    USER ||--o| DOCTOR : "is (role DOCTOR)"
    USER ||--o{ REFRESH_TOKEN : owns
    USER ||--o{ CONSULTATION : "patient of"
    USER ||--o{ PAYMENT : pays
    USER ||--o{ PRESCRIPTION : receives
    USER ||--o{ AUDIT_LOG : "actor of"
    USER ||--o{ IDEMPOTENCY_RECORD : owns
    USER ||--o{ NOTIFICATION_JOB : receives
    DOCTOR ||--o{ AVAILABILITY_SLOT : offers
    DOCTOR ||--o{ CONSULTATION : conducts
    DOCTOR ||--o{ PRESCRIPTION : issues
    AVAILABILITY_SLOT ||--o{ CONSULTATION : "booked as (≤1 active)"
    CONSULTATION ||--o| PRESCRIPTION : produces
    CONSULTATION ||--o| PAYMENT : "paid by"
    PRESCRIPTION ||--|{ PRESCRIPTION_ITEM : contains
    PAYMENT ||--o{ PAYMENT_EVENT : "provider events"

    USER {
        uuid id PK
        string email UK
        string password_hash "argon2id"
        enum role "PATIENT|DOCTOR|ADMIN"
        enum status "ACTIVE|SUSPENDED"
        bool mfa_enabled
        string mfa_secret "AES-256-GCM, nullable"
        timestamptz created_at
        timestamptz updated_at
    }
    PROFILE {
        uuid id PK
        uuid user_id FK,UK
        string first_name
        string last_name
        string phone
        date date_of_birth
        enum gender
        string timezone
    }
    DOCTOR {
        uuid id PK
        uuid user_id FK,UK
        string specialization "indexed"
        string[] qualifications
        int years_of_experience
        string[] languages
        int consultation_fee_minor "check >= 0"
        char3 currency "check ^[A-Z]{3}$"
        enum verification_status "PENDING|VERIFIED|REJECTED"
        decimal rating_average
    }
    AVAILABILITY_SLOT {
        uuid id PK
        uuid doctor_id FK
        timestamptz starts_at
        timestamptz ends_at "check ends_at > starts_at"
        enum status "AVAILABLE|BOOKED|BLOCKED"
    }
    CONSULTATION {
        uuid id PK
        uuid patient_id FK
        uuid doctor_id FK
        uuid slot_id FK "partial unique where status<>CANCELLED"
        enum status "SCHEDULED|IN_PROGRESS|COMPLETED|CANCELLED|NO_SHOW"
        enum mode "VIDEO|AUDIO|CHAT"
        timestamptz scheduled_starts_at
        timestamptz scheduled_ends_at
        timestamptz started_at
        timestamptz ended_at
        timestamptz cancelled_at
        uuid cancelled_by_id FK
        string cancellation_reason
        string doctor_notes "sensitive"
        string video_session_id
    }
    PRESCRIPTION {
        uuid id PK
        uuid consultation_id FK,UK
        uuid doctor_id FK
        uuid patient_id FK
        string diagnosis "sensitive"
        string instructions "sensitive"
        timestamptz issued_at
        timestamptz valid_until
    }
    PRESCRIPTION_ITEM {
        uuid id PK
        uuid prescription_id FK
        string medication_name
        string dosage
        string frequency
        int duration_days "check > 0"
    }
    PAYMENT {
        uuid id PK
        uuid consultation_id FK,UK
        uuid patient_id FK
        int amount_minor "check >= 0"
        char3 currency
        enum status "PENDING|PROCESSING|SUCCEEDED|FAILED|REFUNDED"
        enum provider "STRIPE|MOCK"
        string provider_payment_id UK
        string provider_refund_id
        timestamptz paid_at
        timestamptz refunded_at
    }
    PAYMENT_EVENT {
        uuid id PK
        uuid payment_id FK
        string provider_event_id UK "webhook dedupe"
        string type
        json payload
    }
    REFRESH_TOKEN {
        uuid id PK
        uuid user_id FK
        string token_hash UK "sha256"
        uuid family_id "indexed"
        timestamptz expires_at
        timestamptz revoked_at
        uuid replaced_by_id
    }
    IDEMPOTENCY_RECORD {
        uuid id PK
        uuid user_id FK "unique (user_id, key)"
        string key
        string request_hash
        int status_code
        json response_body
        timestamptz completed_at
        timestamptz expires_at
    }
    NOTIFICATION_JOB {
        uuid id PK
        string type
        enum channel
        uuid recipient_id FK
        json payload
        enum status "PENDING|PROCESSING|SENT|FAILED"
        int attempts
        int max_attempts
        timestamptz next_run_at "indexed with status"
    }
    AUDIT_LOG {
        uuid id PK
        uuid actor_id FK "nullable"
        enum actor_role
        string action "indexed"
        string entity_type
        string entity_id
        json metadata "ids/statuses only"
        string ip
        string request_id
        timestamptz created_at
    }
```

## Important constraints and indexes

| Constraint | Purpose |
|---|---|
| `users.email` UNIQUE (stored lower-case) | One account per email |
| `refresh_tokens.token_hash` UNIQUE | Only hashes are stored; lookup by hash |
| `availability_slots (doctor_id, starts_at)` UNIQUE | No duplicate slot start per doctor |
| `availability_slots` CHECK `ends_at > starts_at` | Valid intervals |
| `consultations_active_slot_unique` — UNIQUE `(slot_id) WHERE status <> 'CANCELLED'` | **At most one live consultation per slot** (database-level double-booking guard); cancelled ones release the slot |
| `consultations` CHECK `scheduled_ends_at > scheduled_starts_at` | Valid intervals |
| `prescriptions.consultation_id` UNIQUE | One prescription per consultation |
| `payments.consultation_id` UNIQUE | One payment per consultation |
| `payments.provider_payment_id` UNIQUE | A Stripe PaymentIntent maps to one payment |
| `payment_events.provider_event_id` UNIQUE | Webhook idempotency |
| `idempotency_records (user_id, key)` UNIQUE | Request idempotency |
| `doctors`/`payments` CHECK fee/amount ≥ 0, currency `^[A-Z]{3}$` | Money sanity |
| `prescription_items` CHECK `duration_days > 0` | |

Hot-path indexes: `doctors(verification_status, specialization)`, `doctors(consultation_fee_minor)`,
`availability_slots(doctor_id, status, starts_at)`, `availability_slots(status, starts_at)`,
`consultations(patient_id, status, scheduled_starts_at)`, `consultations(doctor_id, status, scheduled_starts_at)`,
`consultations(status, scheduled_starts_at)`, `payments(status, created_at)`, `audit_logs(action, created_at)`,
`audit_logs(entity_type, entity_id)`, `notification_jobs(status, next_run_at)`, `idempotency_records(expires_at)`.

## Delete behaviour

- `User` → `Profile`, `RefreshToken`, `IdempotencyRecord`, `NotificationJob`: **cascade** (account removal).
- `User`/`Doctor`/`Slot` → `Consultation`, `Prescription`, `Payment`: **restrict** (medical and financial
  records are never silently deleted; accounts are suspended instead).
- `AuditLog.actor_id`, `PaymentEvent.payment_id`, `Consultation.cancelled_by_id`: **set null** (the trail
  survives the actor).

## Data types

- All primary keys: UUID generated in the database (`gen_random_uuid()`).
- Money: integer **minor units** (`amount_minor`, `consultation_fee_minor`) + ISO 4217 code; no floats.
- Timestamps: `timestamptz(3)`, stored in UTC; clients send ISO 8601 with offset, user timezone kept in
  `profiles.timezone` for display only.
- Sensitive columns (`password_hash`, `mfa_secret`, `doctor_notes`, prescription contents) are never
  logged and never included in audit metadata.
