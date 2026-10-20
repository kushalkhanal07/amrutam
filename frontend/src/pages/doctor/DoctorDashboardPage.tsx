import { useQuery } from '@tanstack/react-query';
import { endOfDay, startOfDay } from 'date-fns';
import { CalendarDays, CalendarPlus, CheckCircle2, Clock3 } from 'lucide-react';
import { Link } from 'react-router';
import { AppointmentCard } from '@/components/appointments/AppointmentCard';
import { ConsultationStatusBadge, PaymentStatusBadge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { SectionHeader } from '@/components/ui/PageHeader';
import { CardSkeleton, EmptyState, ErrorState, InlineAlert } from '@/components/ui/States';
import { consultationsApi } from '@/lib/api/endpoints';
import { useAuth } from '@/lib/auth/AuthContext';
import { formatTime, fullName } from '@/lib/utils/format';
import { useDoctorProfile } from './useDoctorProfile';

export function DoctorDashboardPage() {
  const { user } = useAuth();
  const profile = useDoctorProfile();
  const today = new Date();

  const todays = useQuery({
    queryKey: ['consultations', 'today'],
    queryFn: () => consultationsApi.list({ from: startOfDay(today).toISOString(), to: endOfDay(today).toISOString(), limit: 50 }),
  });
  const upcoming = useQuery({
    queryKey: ['consultations', 'upcoming-doctor'],
    queryFn: () => consultationsApi.list({ status: 'SCHEDULED', from: endOfDay(today).toISOString(), limit: 5 }),
  });
  const completed = useQuery({ queryKey: ['consultations', 'completed-count'], queryFn: () => consultationsApi.list({ status: 'COMPLETED', limit: 1 }) });

  const todayItems = [...(todays.data?.items ?? [])].sort((a, b) => a.scheduledStartsAt.localeCompare(b.scheduledStartsAt));
  const active = todayItems.filter((c) => c.status === 'SCHEDULED' || c.status === 'IN_PROGRESS');

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Today</p>
          <h1 className="font-display mt-1 text-3xl">Dr. {user?.profile?.lastName ?? ''}</h1>
          <p className="mt-1 text-muted">
            {active.length === 0 ? 'No consultations scheduled today.' : `${active.length} consultation${active.length === 1 ? '' : 's'} to see today.`}
          </p>
        </div>
        <ButtonLink to="/doctor/availability" variant="outline" leftIcon={<CalendarPlus className="size-4" />}>
          Manage availability
        </ButtonLink>
      </div>

      {profile.missing && (
        <InlineAlert tone="warning">
          Your doctor profile is not set up yet. <Link to="/doctor/profile" className="font-medium underline">Create it</Link> so patients can find you.
        </InlineAlert>
      )}
      {profile.data?.verificationStatus === 'PENDING' && <InlineAlert tone="info">Your profile is pending verification. Patients can book once an administrator approves it.</InlineAlert>}

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Summary">
        <Stat icon={Clock3} label="Today" value={active.length} />
        <Stat icon={CalendarDays} label="Upcoming (scheduled)" value={upcoming.data?.total} />
        <Stat icon={CheckCircle2} label="Completed" value={completed.data?.total} />
      </section>

      <section>
        <SectionHeader title="Today's schedule" description="Start a consultation when the patient has paid." />
        <div className="mt-4 surface divide-y divide-line">
          {todays.isPending && <CardSkeleton className="border-0 shadow-none" />}
          {todays.isError && <ErrorState compact error={todays.error} onRetry={() => todays.refetch()} />}
          {todays.data && todayItems.length === 0 && <EmptyState compact icon={CalendarDays} title="Nothing on the calendar today" />}
          {todayItems.map((c) => (
            <Link key={c.id} to={`/doctor/consultations/${c.id}`} className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-4 transition-colors hover:bg-mint/50 focus-visible:outline-none focus-visible:bg-mint">
              <span className="w-20 shrink-0 font-display text-lg">{formatTime(c.scheduledStartsAt)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{fullName(c.patient.profile)}</span>
                <span className="block truncate text-sm text-muted">{c.reasonForVisit ?? 'No reason given'}</span>
              </span>
              <span className="flex items-center gap-2">
                {c.payment && c.status === 'SCHEDULED' && <PaymentStatusBadge status={c.payment.status} />}
                <ConsultationStatusBadge status={c.status} />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader
          title="Upcoming"
          action={
            <Link to="/doctor/schedule" className="text-sm font-medium text-forest hover:underline">
              Full schedule
            </Link>
          }
        />
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {upcoming.isPending && <CardSkeleton />}
          {upcoming.data?.items.map((c) => (
            <AppointmentCard key={c.id} consultation={c} perspective="doctor" href={`/doctor/consultations/${c.id}`} compact />
          ))}
          {upcoming.data && upcoming.data.items.length === 0 && <EmptyState compact title="No upcoming bookings" description="Add availability so patients can book." className="md:col-span-2" />}
        </div>
      </section>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value?: number }) {
  return (
    <div className="surface flex items-center gap-4 p-5">
      <span className="flex size-11 items-center justify-center rounded-md bg-mint text-forest">
        <Icon className="size-5" aria-hidden />
      </span>
      <span>
        <span className="block text-sm text-muted">{label}</span>
        <span className="font-display block text-2xl">{value ?? '–'}</span>
      </span>
    </div>
  );
}
