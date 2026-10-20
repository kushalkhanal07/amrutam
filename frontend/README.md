# Amrutam Telemedicine — Frontend

React 19 + TypeScript + Vite + Tailwind CSS v4 + React Router 7 + TanStack Query + React Hook Form + Zod.
Talks to the NestJS backend in `../backend` through its REST API (`../backend/docs/openapi.json`).

## Run it

```bash
# 1. Backend (see ../backend/README.md): docker compose up -d postgres, migrate, seed, npm run start:dev
# 2. Frontend
cd frontend
cp .env.example .env        # VITE_API_URL defaults to http://localhost:3000
npm install
npm run dev                 # http://localhost:5173
```

Demo accounts (password `Password123!`): `patient@amrutam.local`, `dr.meera@amrutam.local`,
`dr.arjun@amrutam.local`, `dr.sunita@amrutam.local`, `admin@amrutam.local`.

The backend's `CORS_ORIGIN` must include `http://localhost:5173` (it does by default).

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Type-check (`tsc -b`) + production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | `tsc -b` |
| `npm run lint` | ESLint (TypeScript + React hooks rules) |
| `npm test` | Vitest unit/component tests (jsdom) |
| `SMOKE=1 npx vitest run src/test/app.smoke.test.tsx` | Live smoke test against a running, seeded backend: directory, patient login, doctor workspace, admin analytics |

## What is where

```
src/
  main.tsx, App.tsx          providers, routes (role areas are lazy-loaded)
  index.css                  design tokens (@theme), base styles, motion utilities
  lib/api/                   fetch client (auth header, refresh-token rotation, typed errors), endpoint functions, API types
  lib/auth/                  session store + AuthProvider/useAuth
  lib/utils/                 cn(), date/money/name formatting
  components/ui/             Button, IconButton, Input/Select/Textarea/SearchField, Badge (status), Modal/ConfirmDialog,
                             Toast, Skeleton/Empty/Error states, Avatar, PageHeader, Table/Pagination, Stepper, Picture, Logo
  components/layout/         PublicLayout (nav + footer), AppShell (sidebar + topbar + mobile drawer), ProtectedRoute
  components/doctors/        DoctorCard, SlotPicker (day strip + time grid)
  components/appointments/   AppointmentCard
  components/prescriptions/  PrescriptionView (printable)
  pages/public/              Landing, Doctors directory (filters, sort, pagination), Doctor profile (availability + booking panel)
  pages/auth/                Login (with TOTP step), Register (patient/doctor)
  pages/patient/             Dashboard, Booking (5-step flow, idempotency, conflict handling), Appointments, Consultation detail,
                             Payment (Stripe Elements or mock), Prescriptions
  pages/doctor/              Today, Schedule, Availability (generate/block/delete slots), Profile setup, Consultation
                             (start/complete/no-show + prescription form)
  pages/admin/               Overview (analytics), Users (role/status), Doctors (verify/reject), Audit logs (filters)
  pages/SettingsPage.tsx     Profile + two-step verification (doctor/admin)
```

## Design system

Tokens live in `src/index.css` under `@theme`: forest `#245C45`, deep green `#173F32`, sage `#DCE8DC`, mint `#EFF5EF`,
cream `#FAF8F2`, ink `#24342D`, muted `#748078`, line `#E5EAE4`, success/warning/error. Type: DM Sans (UI) and Lora
(editorial headings via `.font-display`). Radii 6–20 px, two shadows (`--shadow-soft`, `--shadow-lift`) and one focus ring.
`prefers-reduced-motion` disables the entrance/hover motion.

Status is always conveyed with an icon and text, never colour alone. Every dialog traps focus and closes on Escape.
All forms use labelled inputs with inline validation (Zod) and `role="alert"` errors.

## Payments

- Backend with **mock provider** (default): the payment page shows a clearly marked simulated checkout.
- Backend with **Stripe**: set `VITE_STRIPE_PUBLISHABLE_KEY=pk_test_…` here; the page renders Stripe's Payment Element and confirms
  the PaymentIntent. The booking becomes paid when Stripe's webhook reaches the backend (run `stripe listen` locally).

## Images

Hero/aside photography is loaded from Unsplash. If a request fails or you are offline, `<Picture>` falls back to a botanical
CSS composition so layouts never break. No doctor portraits are shown because the API does not provide them; initials avatars are used.

## Honest data

Everything on screen comes from the backend. The only hard-coded content is marketing copy on the landing page and the
specialty list used for filter shortcuts. No ratings, credentials, prices or availability are invented; absent fields are omitted.
