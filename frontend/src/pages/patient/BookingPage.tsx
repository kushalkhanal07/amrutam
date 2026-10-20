import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays } from 'date-fns';
import { ArrowLeft, ArrowRight, CalendarCheck, CalendarX2, CreditCard, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { z } from 'zod';
import { SlotPicker } from '@/components/doctors/SlotPicker';
import { doctorDisplayName } from '@/components/doctors/DoctorCard';
import { Avatar } from '@/components/ui/Avatar';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Select, Textarea } from '@/components/ui/Field';
import { Logo } from '@/components/ui/Logo';
import { ConfirmDialog } from '@/components/ui/Modal';
import { Stepper } from '@/components/ui/Stepper';
import { ErrorState, InlineAlert, Skeleton, describeError } from '@/components/ui/States';
import { bookingsApi, doctorsApi } from '@/lib/api/endpoints';
import { isHttpError } from '@/lib/api/client';
import type { Consultation, Slot } from '@/lib/api/types';
import { formatDate, formatMoney, formatTime, fullName, humanizeStatus } from '@/lib/utils/format';

const STEPS = ['Doctor', 'Time', 'Review', 'Confirm', 'Done'];

const reviewSchema = z.object({
  mode: z.enum(['VIDEO', 'AUDIO', 'CHAT']),
  reasonForVisit: z.string().trim().max(500, 'Keep it under 500 characters').optional(),
});
type ReviewValues = z.infer<typeof reviewSchema>;

type Outcome = { kind: 'success'; consultation: Consultation } | { kind: 'conflict'; message: string } | { kind: 'error'; message: string };

export function BookingPage() {
  const { doctorId = '' } = useParams();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(0);
  const [day, setDay] = useState<Date | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // One idempotency key per (slot, payload) attempt. Retrying the same request reuses it.
  const idempotencyKey = useRef<string>(crypto.randomUUID());

  const doctor = useQuery({ queryKey: ['doctors', doctorId], queryFn: () => doctorsApi.get(doctorId), enabled: Boolean(doctorId) });
  const slots = useQuery({
    queryKey: ['doctors', doctorId, 'availability'],
    queryFn: () => doctorsApi.availability(doctorId, { to: addDays(new Date(), 14).toISOString() }),
    enabled: Boolean(doctorId),
  });

  // Preselect a slot passed from the profile page.
  const preselect = sp.get('slot');
  useEffect(() => {
    if (preselect && slots.data && !slot) {
      const found = slots.data.find((s) => s.id === preselect);
      if (found) {
        setSlot(found);
        setDay(new Date(found.startsAt));
        setStep(2);
      }
    }
  }, [preselect, slots.data, slot]);

  const form = useForm<ReviewValues>({ resolver: zodResolver(reviewSchema), defaultValues: { mode: 'VIDEO', reasonForVisit: '' } });
  const review = form.watch();

  const booking = useMutation({
    mutationFn: (values: ReviewValues) =>
      bookingsApi.create({ doctorId, slotId: slot!.id, mode: values.mode, reasonForVisit: values.reasonForVisit || undefined }, idempotencyKey.current),
    onSuccess: (consultation) => {
      setOutcome({ kind: 'success', consultation });
      setStep(4);
      void queryClient.invalidateQueries({ queryKey: ['consultations'] });
      void queryClient.invalidateQueries({ queryKey: ['doctors', doctorId, 'availability'] });
    },
    onError: (err) => {
      if (isHttpError(err, 409)) {
        setOutcome({ kind: 'conflict', message: err.message });
        void queryClient.invalidateQueries({ queryKey: ['doctors', doctorId, 'availability'] });
      } else {
        setOutcome({ kind: 'error', message: describeError(err) });
      }
      setStep(4);
    },
    onSettled: () => setConfirmOpen(false),
  });

  const chooseSlot = (s: Slot) => {
    if (s.id !== slot?.id) idempotencyKey.current = crypto.randomUUID();
    setSlot(s);
  };

  const restartWithAnotherSlot = () => {
    setOutcome(null);
    setSlot(null);
    idempotencyKey.current = crypto.randomUUID();
    setStep(1);
    void slots.refetch();
  };

  const feeLabel = useMemo(() => (doctor.data ? formatMoney(doctor.data.consultationFeeMinor, doctor.data.currency) : ''), [doctor.data]);

  if (doctor.isError) {
    return (
      <Shell>
        <ErrorState error={doctor.error} onRetry={() => doctor.refetch()} />
      </Shell>
    );
  }

  return (
    <Shell>
      <Stepper steps={STEPS} current={step} className="mb-8" />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="surface p-6 sm:p-8">
          {/* Step 1: doctor */}
          {step === 0 && (
            <section aria-labelledby="step-doctor">
              <h1 id="step-doctor" className="font-display text-2xl">
                Your doctor
              </h1>
              <p className="mt-1 text-muted">Confirm who you would like to consult.</p>
              {doctor.isPending ? (
                <div className="mt-6 flex gap-4">
                  <Skeleton className="size-16 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-1/2" />
                    <Skeleton className="h-4 w-1/3" />
                  </div>
                </div>
              ) : (
                <div className="mt-6 flex items-start gap-4 rounded-lg border border-line bg-cream p-4">
                  <Avatar name={fullName(doctor.data.user.profile)} size="lg" />
                  <div>
                    <p className="font-display text-lg">{doctorDisplayName(doctor.data)}</p>
                    <p className="text-sm text-muted">{doctor.data.specialization}</p>
                    <p className="mt-2 text-sm">
                      Consultation fee <strong>{feeLabel}</strong>
                    </p>
                  </div>
                </div>
              )}
              <div className="mt-8 flex justify-between">
                <ButtonLink to="/doctors" variant="ghost" leftIcon={<ArrowLeft className="size-4" />}>
                  Choose another doctor
                </ButtonLink>
                <Button onClick={() => setStep(1)} disabled={doctor.isPending} rightIcon={<ArrowRight className="size-4" />}>
                  Choose a time
                </Button>
              </div>
            </section>
          )}

          {/* Step 2: time */}
          {step === 1 && (
            <section aria-labelledby="step-time">
              <h1 id="step-time" className="font-display text-2xl">
                Choose a date and time
              </h1>
              <p className="mt-1 text-muted">Open slots for the next 14 days, in your local time.</p>
              <div className="mt-6">
                {slots.isPending && (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <Skeleton key={i} className="h-11" />
                    ))}
                  </div>
                )}
                {slots.isError && <ErrorState compact error={slots.error} onRetry={() => slots.refetch()} />}
                {slots.data && (
                  <SlotPicker
                    slots={slots.data}
                    selectedDay={day}
                    selectedSlotId={slot?.id ?? null}
                    onSelectDay={(d) => {
                      setDay(d);
                      setSlot(null);
                    }}
                    onSelectSlot={chooseSlot}
                  />
                )}
              </div>
              <div className="mt-8 flex justify-between">
                <Button variant="ghost" onClick={() => setStep(0)} leftIcon={<ArrowLeft className="size-4" />}>
                  Back
                </Button>
                <Button onClick={() => setStep(2)} disabled={!slot} rightIcon={<ArrowRight className="size-4" />}>
                  Review details
                </Button>
              </div>
            </section>
          )}

          {/* Step 3: review */}
          {step === 2 && slot && (
            <form
              aria-labelledby="step-review"
              onSubmit={form.handleSubmit(() => {
                setStep(3);
                setConfirmOpen(true);
              })}
              noValidate
            >
              <h1 id="step-review" className="font-display text-2xl">
                Review your appointment
              </h1>
              <p className="mt-1 text-muted">Add anything your doctor should know before you meet.</p>
              <div className="mt-6 space-y-5">
                <Select label="Consultation type" {...form.register('mode')}>
                  <option value="VIDEO">Video call</option>
                  <option value="AUDIO">Audio call</option>
                  <option value="CHAT">Chat</option>
                </Select>
                <Textarea
                  label="Reason for visit (optional)"
                  placeholder="For example: recurring headaches for two weeks, worse in the evening."
                  hint="Shared only with your doctor."
                  error={form.formState.errors.reasonForVisit?.message}
                  {...form.register('reasonForVisit')}
                />
              </div>
              <div className="mt-8 flex justify-between">
                <Button type="button" variant="ghost" onClick={() => setStep(1)} leftIcon={<ArrowLeft className="size-4" />}>
                  Change time
                </Button>
                <Button type="submit" rightIcon={<ArrowRight className="size-4" />}>
                  Confirm booking
                </Button>
              </div>
            </form>
          )}

          {/* Step 4: confirm (dialog) placeholder content */}
          {step === 3 && (
            <section>
              <h1 className="font-display text-2xl">Confirming…</h1>
              <p className="mt-1 text-muted">Please confirm in the dialog to reserve your slot.</p>
              {!confirmOpen && !booking.isPending && (
                <Button className="mt-6" onClick={() => setConfirmOpen(true)}>
                  Open confirmation
                </Button>
              )}
            </section>
          )}

          {/* Step 5: result */}
          {step === 4 && outcome?.kind === 'success' && (
            <section aria-live="polite" className="animate-rise text-center">
              <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-success-soft text-success">
                <CalendarCheck className="size-8" aria-hidden />
              </div>
              <h1 className="font-display mt-5 text-2xl">Your appointment is booked</h1>
              <p className="mt-2 text-muted">
                {formatDate(outcome.consultation.scheduledStartsAt)} at {formatTime(outcome.consultation.scheduledStartsAt)} with{' '}
                {doctor.data ? doctorDisplayName(doctor.data) : 'your doctor'}. Status: {humanizeStatus(outcome.consultation.status)}.
              </p>
              <InlineAlert tone="warning" className="mt-6 text-left">
                Payment is pending. Your doctor can start the consultation only after the fee of <strong>{feeLabel}</strong> is paid.
              </InlineAlert>
              <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
                <Button size="lg" onClick={() => navigate(`/app/appointments/${outcome.consultation.id}/pay`)} leftIcon={<CreditCard className="size-4" />}>
                  Pay now
                </Button>
                <ButtonLink to={`/app/appointments/${outcome.consultation.id}`} variant="outline" size="lg">
                  View appointment
                </ButtonLink>
              </div>
            </section>
          )}
          {step === 4 && outcome?.kind === 'conflict' && (
            <section aria-live="assertive" className="animate-rise text-center">
              <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-warning-soft text-warning">
                <CalendarX2 className="size-8" aria-hidden />
              </div>
              <h1 className="font-display mt-5 text-2xl">That time was just taken</h1>
              <p className="mt-2 text-muted">
                Someone else reserved this slot a moment before you. Nothing has been booked or charged. Please choose another time.
              </p>
              <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
                <Button size="lg" onClick={restartWithAnotherSlot}>
                  Choose another slot
                </Button>
                <ButtonLink to="/doctors" variant="outline" size="lg">
                  Browse other doctors
                </ButtonLink>
              </div>
            </section>
          )}
          {step === 4 && outcome?.kind === 'error' && (
            <section aria-live="assertive" className="text-center">
              <ErrorState compact error={new Error(outcome.message)} title="We could not complete the booking" />
              <div className="flex flex-col justify-center gap-2 sm:flex-row">
                <Button onClick={() => { setOutcome(null); setStep(3); setConfirmOpen(true); }}>Try again</Button>
                <Button variant="outline" onClick={restartWithAnotherSlot}>
                  Choose another slot
                </Button>
              </div>
            </section>
          )}
        </div>

        {/* Summary */}
        <aside className="surface h-fit p-6 lg:sticky lg:top-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Appointment summary</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-muted">Doctor</dt>
              <dd className="font-medium">{doctor.data ? doctorDisplayName(doctor.data) : '—'}</dd>
            </div>
            <div>
              <dt className="text-muted">When</dt>
              <dd className="font-medium">{slot ? `${formatDate(slot.startsAt)} · ${formatTime(slot.startsAt)} – ${formatTime(slot.endsAt)}` : 'Not chosen yet'}</dd>
            </div>
            <div>
              <dt className="text-muted">Type</dt>
              <dd className="font-medium">{humanizeStatus(review.mode)}</dd>
            </div>
            <div className="border-t border-line pt-3">
              <dt className="text-muted">Fee</dt>
              <dd className="font-display text-xl">{feeLabel || '—'}</dd>
            </div>
          </dl>
          <p className="mt-5 flex items-start gap-2 text-xs text-muted">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-forest" aria-hidden />
            Your slot is reserved only when the server confirms it. Duplicate submissions are prevented automatically.
          </p>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => {
          setConfirmOpen(false);
          setStep(2);
        }}
        onConfirm={() => booking.mutate(form.getValues())}
        loading={booking.isPending}
        title="Reserve this slot?"
        description={slot ? `${formatDate(slot.startsAt)} at ${formatTime(slot.startsAt)}` : undefined}
        confirmLabel="Yes, book it"
      >
        <p className="text-sm text-ink/80">
          You will be asked to pay <strong>{feeLabel}</strong> after the booking is confirmed. You can cancel a scheduled appointment from your dashboard.
        </p>
      </ConfirmDialog>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-cream">
      <header className="border-b border-line bg-white">
        <div className="container-x flex h-16 items-center justify-between">
          <Logo />
          <Link to="/app" className="text-sm text-muted hover:text-forest">
            Back to dashboard
          </Link>
        </div>
      </header>
      <main className="container-x animate-fade max-w-5xl py-8 lg:py-12">{children}</main>
    </div>
  );
}
