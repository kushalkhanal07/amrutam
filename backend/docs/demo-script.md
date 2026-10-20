# Five-minute demo script

Setup beforehand: `docker compose up -d postgres && npx prisma migrate deploy && npm run db:seed && npm run start:dev`.
Open Swagger UI at http://localhost:3000/docs (Authorize button accepts the bearer token). All seeded
passwords are `Password123!`. The commands below use `curl` + `jq`; the same calls work from Swagger.

```bash
API=http://localhost:3000
```

### 0:00 — Health and docs (20 s)
```bash
curl -s $API/health | jq .
curl -s $API/ready | jq .status
```
Point out `/docs` (OpenAPI), `/metrics` (Prometheus), and `X-Request-Id` on every response.

### 0:20 — Patient logs in and searches (40 s)
```bash
PT=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"patient@amrutam.local","password":"Password123!"}' | jq -r .accessToken)
curl -s "$API/doctors?specialization=Ayurveda&availableOnly=true&sortBy=fee&sortDir=asc" | jq '.items[] | {id, specialization, consultationFeeMinor, name: .user.profile}'
DOC=$(curl -s "$API/doctors?specialization=Ayurveda&limit=1" | jq -r '.items[0].id')
SLOT=$(curl -s "$API/doctors/$DOC/availability" | jq -r '.[0].id')
```
Mention: only VERIFIED doctors are listed, no emails leak, pagination/sorting are indexed.

### 1:00 — Book with an idempotency key (60 s)
```bash
KEY=$(uuidgen)
curl -s -X POST $API/bookings -H "Authorization: Bearer $PT" -H "Idempotency-Key: $KEY" \
  -H 'Content-Type: application/json' -d "{\"doctorId\":\"$DOC\",\"slotId\":\"$SLOT\"}" | tee /tmp/b.json | jq '{id, status, payment}'
CID=$(jq -r .id /tmp/b.json); PAY=$(jq -r .payment.id /tmp/b.json)

# Retry with the same key → same booking, header Idempotent-Replayed: true
curl -s -i -X POST $API/bookings -H "Authorization: Bearer $PT" -H "Idempotency-Key: $KEY" \
  -H 'Content-Type: application/json' -d "{\"doctorId\":\"$DOC\",\"slotId\":\"$SLOT\"}" | grep -i -E 'HTTP|replayed'

# Another attempt on the same slot → 409
curl -s -X POST $API/bookings -H "Authorization: Bearer $PT" -H "Idempotency-Key: $(uuidgen)" \
  -H 'Content-Type: application/json' -d "{\"doctorId\":\"$DOC\",\"slotId\":\"$SLOT\"}" | jq .
```
Explain the transaction: conditional `UPDATE … WHERE status='AVAILABLE'`, consultation + payment +
audit + outbox in one commit, partial unique index as the DB backstop. Mention
`test/booking.e2e-spec.ts` runs 12 concurrent patients and exactly one wins.

### 2:00 — Pay (mock provider) (30 s)
```bash
curl -s -X POST $API/payments/intents -H "Authorization: Bearer $PT" -H 'Content-Type: application/json' \
  -d "{\"consultationId\":\"$CID\"}" | jq .
curl -s -X POST $API/payments/$PAY/mock-confirm -H "Authorization: Bearer $PT" -H 'Content-Type: application/json' -d '{}' | jq .
curl -s -X POST $API/payments/$PAY/mock-confirm -H "Authorization: Bearer $PT" -H 'Content-Type: application/json' -d '{}' | jq .   # duplicate → no-op
```
Say clearly: no real payment. With `STRIPE_SECRET_KEY` set, the same endpoint returns a real
PaymentIntent `clientSecret`, and the webhook replaces `mock-confirm`.

### 2:30 — Doctor runs the consultation and prescribes (60 s)
```bash
DR=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"dr.sunita@amrutam.local","password":"Password123!"}' | jq -r .accessToken)
# (use the doctor that owns $DOC; dr.sunita is the cheapest Ayurveda doctor in the seed)
curl -s -X POST $API/consultations/$CID/start -H "Authorization: Bearer $DR" | jq '{status, video}'
curl -s -X POST $API/prescriptions -H "Authorization: Bearer $DR" -H 'Content-Type: application/json' \
  -d "{\"consultationId\":\"$CID\",\"diagnosis\":\"Seasonal allergy\",\"items\":[{\"medicationName\":\"Sitopaladi churna\",\"dosage\":\"3g\",\"frequency\":\"twice daily\",\"durationDays\":14}]}" | jq '{id, diagnosis, items}'
curl -s -X POST $API/consultations/$CID/complete -H "Authorization: Bearer $DR" -H 'Content-Type: application/json' -d '{"doctorNotes":"Follow up in 2 weeks"}' | jq .status
curl -s -X POST $API/consultations/$CID/start -H "Authorization: Bearer $DR" | jq .message   # terminal state → 409
```
Patient reads their prescription; a second patient gets 403:
```bash
curl -s $API/consultations/$CID/prescription -H "Authorization: Bearer $PT" | jq '.items'
```

### 3:30 — Admin analytics and audit trail (45 s)
```bash
AD=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@amrutam.local","password":"Password123!"}' | jq -r .accessToken)
curl -s "$API/admin/analytics/overview?to=$(date -u -d '+8 days' +%FT%TZ)" -H "Authorization: Bearer $AD" | jq '.bookings, .payments'
curl -s "$API/admin/audit-logs?entityId=$CID" -H "Authorization: Bearer $AD" | jq '.items[] | {action, actorRole, metadata}'
```
Point out: audit metadata holds ids/statuses only (no diagnosis), and the patient token gets 403 here.

### 4:15 — Security and ops in 45 seconds
- Refresh-token rotation with reuse detection (`POST /auth/refresh` twice with the old token → 401 + family revoked).
- MFA for doctors/admins (`/auth/mfa/setup` → authenticator app → `/auth/mfa/enable`).
- 10 bad logins → `429` with `Retry-After`.
- `docker compose --profile observability up` → Grafana dashboard with p95 by route, 5xx ratio, DB up.
- `npm test` (58 unit) and `npm run test:e2e` (69 integration, real PostgreSQL) — show the concurrency test name.

End: "Everything shown is one PostgreSQL transaction per workflow, an outbox for async work, and a
provider boundary for Stripe and video. Nothing here claims a real payment was processed."
