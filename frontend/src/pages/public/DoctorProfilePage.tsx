import { useQuery } from '@tanstack/react-query';
import { addDays } from 'date-fns';
import { ArrowLeft, ArrowRight, BadgeCheck, Languages } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { SlotPicker } from '@/components/doctors/SlotPicker';
import { doctorDisplayName } from '@/components/doctors/DoctorCard';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ErrorState, Skeleton, SkeletonText } from '@/components/ui/States';
import { doctorsApi } from '@/lib/api/endpoints';
import type { Slot } from '@/lib/api/types';
import { useAuth } from '@/lib/auth/AuthContext';
import { formatMoney, fullName } from '@/lib/utils/format';

export function DoctorProfilePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, role } = useAuth();
  const [day, setDay] = useState<Date | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);

  const doctor = useQuery({ queryKey: ['doctors', id], queryFn: () => doctorsApi.get(id), enabled: Boolean(id) });
  const slots = useQuery({
    queryKey: ['doctors', id, 'availability'],
    queryFn: () => doctorsApi.availability(id, { to: addDays(new Date(), 14).toISOString() }),
    enabled: Boolean(id),
  });

  if (doctor.isError) {
    return (
      <div className="container-x py-14">
        <ErrorState error={doctor.error} onRetry={() => doctor.refetch()} />
      </div>
    );
  }

  const canBook = !isAuthenticated || role === 'PATIENT';
  const goBook = () => navigate(`/book/${id}${slot ? `?slot=${slot.id}` : ''}`);

  return (
    <div className="container-x animate-fade py-10 lg:py-14">
      <Link to="/doctors" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-forest">
        <ArrowLeft className="size-4" aria-hidden /> Back to directory
      </Link>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-8">
          <header className="surface p-6 sm:p-8">
            {doctor.isPending ? (
              <div className="flex gap-5">
                <Skeleton className="size-24 rounded-full" />
                <div className="flex-1 space-y-3">
                  <Skeleton className="h-7 w-1/2" />
                  <Skeleton className="h-4 w-1/3" />
                  <SkeletonText lines={2} />
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-5 sm:flex-row">
                <Avatar name={fullName(doctor.data.user.profile)} size="xl" />
                <div className="min-w-0 flex-1">
                  <p className="eyebrow">{doctor.data.specialization}</p>
                  <h1 className="font-display mt-1 text-3xl text-ink">{doctorDisplayName(doctor.data)}</h1>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink/80">
                    {doctor.data.verificationStatus === 'VERIFIED' && (
                      <span className="inline-flex items-center gap-1 font-medium text-success">
                        <BadgeCheck className="size-4" aria-hidden /> Verified
                      </span>
                    )}
                    {doctor.data.yearsOfExperience > 0 && <span>{doctor.data.yearsOfExperience} years of experience</span>}
                    {doctor.data.languages.length > 0 && (
                      <span className="inline-flex items-center gap-1.5">
                        <Languages className="size-4 text-muted" aria-hidden /> {doctor.data.languages.join(', ').toUpperCase()}
                      </span>
                    )}
                  </div>
                  {doctor.data.qualifications.length > 0 && (
                    <ul className="mt-4 flex flex-wrap gap-2" aria-label="Qualifications">
                      {doctor.data.qualifications.map((q) => (
                        <li key={q} className="rounded-md bg-mint px-2.5 py-1 text-sm text-forest-deep">
                          {q}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </header>

          <section className="surface p-6 sm:p-8">
            <h2 className="font-display text-xl">About</h2>
            {doctor.isPending ? (
              <SkeletonText className="mt-4" lines={4} />
            ) : doctor.data.bio ? (
              <p className="mt-3 whitespace-pre-line leading-relaxed text-ink/85">{doctor.data.bio}</p>
            ) : (
              <p className="mt-3 text-muted">This doctor has not added a bio yet.</p>
            )}
          </section>

          <section className="surface p-6 sm:p-8" id="availability">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-xl">Next available times</h2>
                <p className="mt-0.5 text-sm text-muted">Shown in your local time for the next 14 days.</p>
              </div>
            </div>
            <div className="mt-5">
              {slots.isPending && (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    {[0, 1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-[74px] w-[88px]" />
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <Skeleton key={i} className="h-11" />
                    ))}
                  </div>
                </div>
              )}
              {slots.isError && <ErrorState compact error={slots.error} onRetry={() => slots.refetch()} />}
              {slots.data && <SlotPicker slots={slots.data} selectedDay={day} selectedSlotId={slot?.id ?? null} onSelectDay={(d) => { setDay(d); setSlot(null); }} onSelectSlot={setSlot} />}
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="surface p-6">
            <p className="text-sm text-muted">Consultation fee</p>
            {doctor.isPending ? (
              <Skeleton className="mt-1 h-8 w-32" />
            ) : (
              <p className="font-display text-3xl text-ink">{formatMoney(doctor.data.consultationFeeMinor, doctor.data.currency)}</p>
            )}
            <p className="mt-1 text-xs text-muted">Per online consultation. Paid after booking.</p>
            {slot && (
              <p className="mt-4 rounded-md bg-mint px-3 py-2 text-sm text-forest-deep" role="status">
                Selected: {new Date(slot.startsAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
              </p>
            )}
            {canBook ? (
              <Button className="mt-5" fullWidth size="lg" onClick={goBook} disabled={doctor.isPending} rightIcon={<ArrowRight className="size-4" />}>
                {slot ? 'Continue to booking' : 'Book a consultation'}
              </Button>
            ) : (
              <p className="mt-5 rounded-md border border-line bg-cream px-3 py-2 text-sm text-muted">Booking is available from a patient account.</p>
            )}
            {!isAuthenticated && <p className="mt-3 text-center text-xs text-muted">You will be asked to sign in or create an account.</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}
