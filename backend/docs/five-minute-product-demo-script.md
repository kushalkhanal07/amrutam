# Amrutam Telemedicine

## Five-minute product demonstration script

This script is designed to be read aloud while demonstrating the Amrutam web
application. It explains the product in business language first and points out
the important system behavior accurately.

## 1. Demonstration preparation

### Accounts

The development seed provides these accounts. The password for all seeded
accounts is `Password123!`.

| Role | Email | Use during the demo |
|---|---|---|
| Patient | `patient@amrutam.local` | Search, book, and pay |
| Doctor | `dr.meera@amrutam.local` | Manage availability and conduct the consultation |
| Administrator | `admin@amrutam.local` | View analytics, users, and audit logs |

The application normally runs at `http://localhost:5173`, with the API at
`http://localhost:3000`.

### Recommended demo data

Before recording, make sure:

1. The backend is running and the database is migrated and seeded.
2. The frontend is running.
3. The patient account has a future appointment slot available.
4. The selected doctor owns the slot and the consultation.
5. The payment provider is in mock mode unless a Stripe test environment is
   intentionally being demonstrated.

In mock mode, the payment is simulated. No real money is moved.

### Presenter notes

- Use a future appointment for the main booking flow.
- The doctor can start a paid consultation before its scheduled start time in
  the current implementation. If you demonstrate this, describe it as an
  early-start capability, not as a scheduling restriction.
- A no-show can only be recorded at or after the scheduled start time, and it
  is final.
- Avoid displaying real patient or payment information during a recording.

## 2. The 5-minute running order

| Time | Section | Goal |
|---|---|---|
| 0:00–0:30 | Introduction | Explain the product and user roles |
| 0:30–1:20 | Patient discovery | Find a verified doctor and an available slot |
| 1:20–2:10 | Booking and payment | Create a protected booking and confirm payment |
| 2:10–3:35 | Doctor consultation | Start, conduct, prescribe, and complete |
| 3:35–4:25 | Patient outcome | Show the appointment and prescription |
| 4:25–5:00 | Administration and close | Show analytics, auditability, and safeguards |

## 3. Full presenter script

### 0:00–0:30 — Introduction

**Screen:** Amrutam landing page or login page.

**Say:**

> “Amrutam is a telemedicine platform that connects patients with verified
> doctors for scheduled consultations. The complete journey is handled in one
> system: doctor discovery, availability, booking, payment, consultation,
> prescriptions, notifications, and administration.”

> “There are three primary roles. Patients search for doctors and book
> appointments. Doctors publish time slots and manage consultations. Admins
> oversee doctors, users, analytics, and the audit trail.”

**Do:**

1. Point out the clean patient-facing entry point.
2. Explain that access to each workspace is role-based.
3. Log in as `patient@amrutam.local`.

### 0:30–1:20 — Patient finds a doctor and books

**Screen:** Patient dashboard or doctor directory.

**Say:**

> “I am now acting as a patient. The doctor directory is designed to show
> verified doctors and their professional information. I can filter by
> specialization, sort the results, and review available appointment slots.”

**Do:**

1. Open the doctor directory.
2. Select a doctor, preferably an Ayurveda doctor.
3. Open the doctor profile.
4. Show the consultation fee, specialization, and available future slots.
5. Select a slot and continue to booking.
6. Enter an optional reason for the visit.
7. Confirm the booking.

**Say after confirmation:**

> “The booking is created as `Scheduled`. The system also creates the
> corresponding payment record as `Pending`. The selected availability slot is
> claimed so another patient cannot book the same slot.”

> “The booking request is protected with an idempotency key. If the browser
> retries the same request, the system can return the original booking instead
> of creating a duplicate appointment.”

**Important behavior to mention only if asked:**

> “The booking is transactional. The slot claim, consultation record, payment
> record, audit record, and notification jobs are committed together. If the
> slot is taken by another patient first, the booking fails cleanly instead of
> creating partial data.”

### 1:20–2:10 — Patient completes payment

**Screen:** Patient appointment details or payment page.

**Say:**

> “The appointment cannot be started until payment succeeds. In this local
> demonstration, the application uses its mock payment provider, so I can
> demonstrate the full flow without charging a real card.”

**Do:**

1. Open the newly created appointment.
2. Select the payment action.
3. Show that the initial payment status is `Pending`.
4. Complete the simulated payment.
5. Refresh or return to the appointment.
6. Show the payment status changing to `Succeeded`.

**Say after payment succeeds:**

> “The consultation is still `Scheduled`, but payment is now `Succeeded`.
> This is the state required before the doctor can start the consultation.”

**Accuracy note:**

> “In a Stripe-enabled environment, the same payment workflow uses a Stripe
> PaymentIntent and webhook or synchronization. In this demo environment, no
> real money is moved.”

### 2:10–3:35 — Doctor conducts the consultation

**Screen:** Doctor login and doctor schedule.

**Do:**

1. Log out or switch to `dr.meera@amrutam.local`.
2. Open the doctor workspace.
3. Open the schedule.
4. Open the consultation belonging to the patient.

**Say:**

> “I am now acting as the consulting doctor. The doctor sees only the
> consultations assigned to this doctor and can manage the consultation
> lifecycle from the consultation page.”

#### Starting the consultation

**Do:**

1. Confirm that the consultation status is `Scheduled`.
2. Confirm that payment shows `Succeeded`.
3. Click **Start consultation**.
4. Show the resulting `In progress` status and video session area.

**Say:**

> “When I start the consultation, the system validates that I am the assigned
> doctor, that the consultation is still scheduled, and that payment has
> succeeded. It then changes the status to `In progress`, records the actual
> start time, creates a video session, and notifies the patient.”

> “The video provider in this demonstration is simulated, so the join link is
> a safe demo URL rather than a real clinical video room.”

**Timing behavior to explain accurately:**

> “The current implementation allows the assigned doctor to start a paid
> consultation before its scheduled start time. The server does not enforce an
> early-start block. The recorded start time is the actual time the doctor
> starts the consultation.”

> “The opposite rule applies to no-show: the doctor cannot mark a consultation
> as no-show before its scheduled start time.”

#### Creating a prescription

**Do:**

1. Open the prescription form.
2. Enter a demonstration diagnosis, such as `Seasonal allergy`.
3. Add one medication and fill in dosage, frequency, and duration.
4. Save the prescription.

**Say:**

> “While the consultation is in progress, the consulting doctor can create a
> prescription. The prescription includes the diagnosis, instructions, and
> medication details such as dosage, frequency, and duration.”

> “The permission is enforced on the server: the prescription must belong to
> this consultation, and only the consulting doctor can issue it. The patient
> can read the prescription after it has been created.”

#### Completing the consultation

**Do:**

1. Click **Complete consultation**.
2. Enter optional doctor notes, such as `Follow up in two weeks`.
3. Confirm completion.
4. Show the `Completed` status.

**Say:**

> “When the doctor completes the consultation, the system ends the video
> session, records the end time, stores the optional clinical notes, changes
> the status to `Completed`, and notifies the patient.”

> “Completed is a terminal state. The consultation cannot be started or
> cancelled again after completion.”

### 3:35–4:25 — Patient sees the result

**Screen:** Patient appointments or prescriptions.

**Do:**

1. Switch back to `patient@amrutam.local`.
2. Open the appointments page.
3. Open the completed consultation.
4. Show the completed status and consultation details.
5. Open the prescription.

**Say:**

> “From the patient side, the appointment now appears as completed. The
> patient can review the consultation record and access the prescription issued
> by the doctor.”

> “Access is scoped to the patient’s own records. A different patient cannot
> read this consultation or prescription.”

**Optional no-show explanation:**

> “If the patient did not attend, the doctor would use No-show instead. That
> action is available only after the scheduled start time, changes the
> consultation from `Scheduled` to `No-show`, records an end time, and is
> permanent. It is kept separate from cancellation for reporting and policy
> decisions.”

### 4:25–5:00 — Admin view and closing

**Screen:** Admin login, overview, or audit logs.

**Do:**

1. Log in as `admin@amrutam.local`.
2. Open the admin overview.
3. Point out consultation counts, including completed, cancelled, and no-show.
4. Open audit logs and filter by the demonstrated consultation if available.

**Say:**

> “Finally, I am viewing the system as an administrator. The admin workspace
> provides operational visibility across users, doctors, consultations,
> payments, and audit events.”

> “The analytics distinguish scheduled, completed, cancelled, and no-show
> consultations. The audit trail records important state changes, including
> who performed the action and the transition that occurred.”

> “The system also applies role-based access control, validates requests,
> protects payment information, and avoids storing card data. Sensitive
> clinical content is not placed in audit metadata.”

**Closing statement:**

> “This demonstration shows the complete Amrutam journey: a patient finds a
> verified doctor, books and pays for a slot, the doctor conducts the
> consultation and issues a prescription, and the administrator retains
> visibility and accountability. The workflow is backed by explicit
> consultation states, transactional database updates, audit logging, and
> provider boundaries for payments and video.”

## 4. Consultation status explanation

Use this wording if someone asks what each status means:

| Status | Meaning |
|---|---|
| `SCHEDULED` | The appointment exists and has not started. |
| `IN_PROGRESS` | The assigned doctor has started the consultation. |
| `COMPLETED` | The consultation ended normally. |
| `CANCELLED` | The appointment was cancelled before completion. |
| `NO_SHOW` | The scheduled start time passed and the appointment was recorded as missed. |

The normal lifecycle is:

```text
SCHEDULED -> IN_PROGRESS -> COMPLETED
SCHEDULED -> CANCELLED
SCHEDULED -> NO_SHOW
```

`COMPLETED`, `CANCELLED`, and `NO_SHOW` are final states.

## 5. Payment and scheduling points to state precisely

Use these exact statements to avoid overclaiming:

- “The doctor cannot start until payment status is `Succeeded`.”
- “The current implementation permits the assigned doctor to start early; it
  does not wait for the scheduled start time.”
- “A no-show cannot be recorded before the scheduled start time.”
- “The demo uses a mock payment provider unless Stripe has been configured.”
- “The video session shown in the demo is simulated.”
- “The appointment status and payment status are separate records.”
- “Cancellation and no-show are different outcomes.”
- “No-show is currently recorded as a status transition; it is not the same
  operation as cancellation.”

## 6. Recovery plan if a step fails during recording

| Problem | Recovery |
|---|---|
| Start button is disabled | Confirm the payment shows `Succeeded`; refresh the consultation. |
| Payment remains pending | Use the mock confirmation flow or verify the payment provider configuration. |
| No doctor slot is visible | Use a future seeded slot or create one from the doctor Availability page. |
| Doctor cannot open the consultation | Confirm the consultation belongs to the logged-in doctor. |
| No-show is rejected | The scheduled start time has not been reached, or the consultation is no longer `Scheduled`. |
| A second booking fails | This is expected when the slot is already booked; select another future slot. |
| Prescription cannot be created | The consultation must be `In progress` or `Completed`, and the doctor must be the consulting doctor. |
| Page displays stale status | Refresh the page; the frontend refreshes consultation queries after mutations. |

## 7. Technical reference for questions after the demo

The main implementation references are:

- Frontend API calls: [`frontend/src/lib/api/endpoints.ts`](../../frontend/src/lib/api/endpoints.ts)
- Doctor consultation page: [`frontend/src/pages/doctor/DoctorConsultationPage.tsx`](../../frontend/src/pages/doctor/DoctorConsultationPage.tsx)
- Consultation API controller: [`backend/src/modules/consultations/consultations.controller.ts`](../src/modules/consultations/consultations.controller.ts)
- Consultation business rules: [`backend/src/modules/consultations/consultations.service.ts`](../src/modules/consultations/consultations.service.ts)
- Consultation state machine: [`backend/src/modules/consultations/consultation-state.ts`](../src/modules/consultations/consultation-state.ts)
- API reference: [`backend/docs/api.md`](./api.md)
- Architecture overview: [`backend/docs/architecture.md`](./architecture.md)
- Existing API-focused demo: [`backend/docs/demo-script.md`](./demo-script.md)

