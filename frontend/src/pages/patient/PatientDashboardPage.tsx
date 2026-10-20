import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, CalendarPlus, CreditCard, FileText, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import { AppointmentCard } from '@/components/appointments/AppointmentCard';
import { doctorDisplayName } from '@/components/doctors/DoctorCard';
import { ButtonLink } from '@/components/ui/Button';
import { SectionHeader } from '@/components/ui/PageHeader';
import { BotanicalMark } from '@/components/ui/Picture';
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/States';
import { consultationsApi, prescriptionsApi } from '@/lib/api/endpoints';
import { useAuth } from '@/lib/auth/AuthContext';
import { formatCountdown, formatDate, formatTime } from '@/lib/utils/format';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function PatientDashboardPage() {
  const { user } = useAuth();
  const now = new Date().toISOString();

  const upcoming = useQuery({
    queryKey: ['consultations', 'upcoming'],
    queryFn: () => consultationsApi.list({ status: 'SCHEDULED', from: now, limit: 5 }),
  });
  const recent = useQuery({
    queryKey: ['consultations', 'recent'],
    queryFn: () => consultationsApi.list({ status: 'COMPLETED', limit: 3 }),
  });
  const prescriptions = useQuery({ queryKey: ['prescriptions', 'count'], queryFn: () => prescriptionsApi.list({ limit: 1 }) });

  const items = [...(upcoming.data?.items ?? [])].sort((a, b) => a.scheduledStartsAt.localeCompare(b.scheduledStartsAt));
  const next = items[0];

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">{greeting()}</p>
        <h1 className="font-display mt-1 text-3xl">{user?.profile?.firstName ?? 'there'}</h1>
        <p className="mt-1 text-muted">Here is what is coming up and where to go next.</p>
      </div>

      {/* Next appointment */}
      <section aria-labelledby="next-heading">
        <h2 id="next-heading" className="sr-only">
          Next appointment
        </h2>
        {upcoming.isPending && <CardSkeleton />}
        {upcoming.isError && <ErrorState compact error={upcoming.error} onRetry={() => upcoming.refetch()} />}
        {upcoming.data && !next && (
          <div className="relative overflow-hidden rounded-xl bg-forest-deep p-7 text-white sm:p-9">
            <BotanicalMark className="absolute -right-10 -top-10 h-56 w-56 text-forest-soft/70" />
            <div className="relative max-w-lg">
              <p className="inline-flex items-center gap-2 text-sm text-sage">
                <Sparkles className="size-4" aria-hidden /> Nothing booked yet
              </p>
              <h2 className="font-display mt-2 text-2xl sm:text-3xl">Book your first consultation</h2>
              <p className="mt-2 text-sage">Browse verified doctors, choose a time that suits you, and we will take care of the rest.</p>
              <ButtonLink to="/doctors" variant="secondary" size="lg" className="mt-6" rightIcon={<ArrowRight className="size-4" />}>
                Find a doctor
              </ButtonLink>
            </div>
          </div>
        )}
        {next && (
          <div className="surface overflow-hidden">
            <div className="flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="eyebrow">Next appointment · {formatCountdown(next.scheduledStartsAt)}</p>
                <h2 className="font-display mt-2 text-2xl">{doctorDisplayName(next.doctor)}</h2>
                <p className="text-muted">{next.doctor.specialization}</p>
                <p className="mt-3 inline-flex items-center gap-2 text-ink/90">
                  <CalendarDays className="size-4 text-forest" aria-hidden />
                  {formatDate(next.scheduledStartsAt)} · {formatTime(next.scheduledStartsAt)} – {formatTime(next.scheduledEndsAt)}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                {next.payment && next.payment.status !== 'SUCCEEDED' && (
                  <ButtonLink to={`/app/appointments/${next.id}/pay`} leftIcon={<CreditCard className="size-4" />}>
                    Pay for this visit
                  </ButtonLink>
                )}
                <ButtonLink to={`/app/appointments/${next.id}`} variant="outline">
                  View details
                </ButtonLink>
              </div>
            </div>
            {next.payment && next.payment.status !== 'SUCCEEDED' && (
              <p className="border-t border-warning/20 bg-warning-soft px-6 py-2.5 text-sm text-warning sm:px-8">
                Payment is still pending. The consultation can only start once it is paid.
              </p>
            )}
          </div>
        )}
      </section>

      {/* Summary metrics */}
      <section className="grid gap-4 sm:grid-cols-3" aria-label="Summary">
        <Metric label="Upcoming" value={upcoming.data?.total} icon={CalendarDays} to="/app/appointments" />
        <Metric label="Completed" value={recent.data?.total} icon={CalendarPlus} to="/app/appointments?status=COMPLETED" />
        <Metric label="Prescriptions" value={prescriptions.data?.total} icon={FileText} to="/app/prescriptions" />
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <SectionHeader
            title="Upcoming"
            action={
              <Link to="/app/appointments" className="text-sm font-medium text-forest hover:underline">
                See all
              </Link>
            }
          />
          <div className="mt-4 space-y-3">
            {upcoming.isPending && <CardSkeleton />}
            {items.slice(0, 3).map((c) => (
              <AppointmentCard key={c.id} consultation={c} perspective="patient" href={`/app/appointments/${c.id}`} compact />
            ))}
            {upcoming.data && items.length === 0 && <EmptyState compact title="No upcoming appointments" />}
          </div>
        </section>
        <section>
          <SectionHeader
            title="Recent consultations"
            action={
              <Link to="/app/appointments?status=COMPLETED" className="text-sm font-medium text-forest hover:underline">
                History
              </Link>
            }
          />
          <div className="mt-4 space-y-3">
            {recent.isPending && <CardSkeleton />}
            {recent.data?.items.map((c) => (
              <AppointmentCard key={c.id} consultation={c} perspective="patient" href={`/app/appointments/${c.id}`} compact />
            ))}
            {recent.data && recent.data.items.length === 0 && <EmptyState compact title="No completed consultations yet" description="They will appear here once a doctor completes your visit." />}
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value, icon: Icon, to }: { label: string; value?: number; icon: typeof CalendarDays; to: string }) {
  return (
    <Link to={to} className="surface flex items-center gap-4 p-5 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] focus-visible:outline-none focus-visible:shadow-[var(--shadow-ring)]">
      <span className="flex size-11 items-center justify-center rounded-md bg-mint text-forest">
        <Icon className="size-5" aria-hidden />
      </span>
      <span>
        <span className="block text-sm text-muted">{label}</span>
        <span className="font-display block text-2xl">{value ?? '–'}</span>
      </span>
    </Link>
  );
}
