# Amrutam Telemedicine

A telemedicine platform where patients find verified doctors, book a slot, pay, hold the consultation
(video, audio or real-time chat) and receive a prescription. Doctors manage availability and run
consultations; admins get analytics and an audit trail.

This repository is a monorepo with two apps:

| Folder | What it is | Stack |
|---|---|---|
| [`backend/`](backend/) | REST + WebSocket API | Node.js 20, NestJS 11, PostgreSQL 17, Prisma 6, Socket.IO, Stripe, Jest |
| [`frontend/`](frontend/) | Web app for patients, doctors and admins | React 19, TypeScript, Vite, Tailwind CSS v4, React Router 7, TanStack Query |

Each app has its own README with full details: [backend/README.md](backend/README.md) and
[frontend/README.md](frontend/README.md).

## Quick start

Prerequisites: Node.js 20 or newer, npm 10 or newer, Docker Desktop.

```bash
# 1. Backend: database, migrations, seed data, API on http://localhost:3000 (Swagger at /docs)
cd backend
cp .env.example .env
npm install
docker compose up -d postgres
npx prisma migrate deploy
npm run db:seed
npm run start:dev

# 2. Frontend: web app on http://localhost:5173 (new terminal)
cd frontend
cp .env.example .env
npm install
npm run dev
```

PostgreSQL runs in Docker on host port **5434** (not 5432) so it never collides with a locally
installed PostgreSQL. Connection details: host `localhost`, port `5434`, user `amrutam`, password
`amrutam`, database `amrutam`. The e2e tests use the `amrutam_test` database in the same container.

### Demo accounts

All seeded accounts use the password `Password123!`.

| Role | Email |
|---|---|
| Admin | `admin@amrutam.local` |
| Doctors | `dr.meera@amrutam.local`, `dr.arjun@amrutam.local`, `dr.sunita@amrutam.local` |
| Patients | `patient@amrutam.local`, `patient2@amrutam.local` |

### Try the full flow

1. Log in as a patient, find a doctor, pick a slot and book.
2. Pay. With no Stripe key configured the built-in mock provider is used and the payment page lets you simulate success or failure.
3. Log in as the doctor (another browser or a private window), open the consultation and click **Start consultation**. The patient receives the join link by email and sees a join button on the appointment page.
4. Both sides open the room. Chat mode is real time over WebSockets; video and audio modes are simulated (local camera and microphone preview only).
5. The doctor writes the prescription and completes the consultation. The patient can view and download it.

## What is implemented

- **Auth**: JWT access tokens with refresh-token rotation, optional TOTP multi-factor auth, role-based access (patient, doctor, admin).
- **Doctors**: public directory with search and filters, profiles, admin verification, availability slots.
- **Bookings**: idempotent slot booking with concurrency protection, cancellation with refunds.
- **Payments**: Stripe Payment Intents with webhooks, or a mock provider for local use.
- **Consultations**: scheduled, in progress, completed, cancelled and no-show states with an audit trail; join link per session.
- **Chat**: Socket.IO gateway on `/chat` with persisted messages, presence and typing indicators.
- **Prescriptions**: issued once per consultation, viewable by the patient.
- **Notifications**: transactional outbox delivered by a background worker. Emails are sent over SMTP when configured, otherwise logged.
- **Admin**: analytics overview, doctor utilisation, user management, audit log viewer.
- **Observability**: structured logs, Prometheus metrics, OpenTelemetry tracing, optional Grafana and Jaeger via Docker Compose.

## Configuration

Copy each app's `.env.example` to `.env`. The defaults work locally. Settings you may want to change:

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | backend | PostgreSQL connection string |
| `JWT_ACCESS_SECRET`, `MFA_ENCRYPTION_KEY` | backend | Replace before any shared deployment |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | backend | Leave empty to use the mock payment provider |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | backend | Real email delivery. Leave `SMTP_HOST` empty to log emails instead |
| `APP_URL`, `CORS_ORIGIN` | backend | Public URL of the frontend, used for email links and CORS |
| `VITE_API_URL` | frontend | Backend base URL |
| `VITE_STRIPE_PUBLISHABLE_KEY` | frontend | Needed only when the backend uses real Stripe |

## Development commands

Backend (run inside `backend/`):

```bash
npm run start:dev      # API with hot reload
npm run lint           # ESLint
npm run typecheck      # tsc
npm test               # unit tests
npm run test:e2e       # integration tests against amrutam_test (needs the Docker database)
npm run prisma:migrate # create a migration after editing prisma/schema.prisma
npm run prisma:studio  # browse the database in the browser
```

Frontend (run inside `frontend/`):

```bash
npm run dev            # Vite dev server
npm run lint
npm run typecheck
npm test               # Vitest
npm run build          # production bundle in dist/
```

## Documentation

Design and operations documents live in [`backend/docs/`](backend/docs/):
[architecture](backend/docs/architecture.md), [ERD](backend/docs/erd.md),
[API reference](backend/docs/api.md) and [OpenAPI spec](backend/docs/openapi.json),
[booking sequence](backend/docs/booking-sequence.md), [security checklist](backend/docs/security-checklist.md),
[threat model](backend/docs/threat-model.md), [observability](backend/docs/observability.md),
[scaling and performance](backend/docs/scaling-and-performance.md),
[disaster recovery](backend/docs/disaster-recovery.md) and the
[five-minute product demo script](backend/docs/five-minute-product-demo-script.md).

## Deployment

- `docker compose --profile app up --build` in `backend/` builds the API image, applies migrations and starts it on port 3000.
- `docker compose --profile observability up -d` adds Prometheus (9090), Grafana (3001) and Jaeger (16686).
- Cloud infrastructure is described in [`backend/infra/terraform/`](backend/infra/terraform/README.md).
- CI runs lint, type-check, unit tests, integration tests and the Docker build on every push via [`backend/.github/workflows/ci.yml`](backend/.github/workflows/ci.yml).
- The frontend is a static bundle (`npm run build`) that can be served by any static host; point `VITE_API_URL` at the deployed API.

## Known limitations

- Video and audio consultations are simulated. The room shows the local camera or microphone, but no media is sent to the other participant. Chat is fully real time.
- The payment mock is for local development only.
