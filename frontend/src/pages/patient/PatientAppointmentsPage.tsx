import { useQuery } from '@tanstack/react-query';
import { CalendarDays } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { AppointmentCard } from '@/components/appointments/AppointmentCard';
import { ButtonLink } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/States';
import { Pagination } from '@/components/ui/Table';
import { consultationsApi } from '@/lib/api/endpoints';
import type { ConsultationStatus } from '@/lib/api/types';
import { cn } from '@/lib/utils/cn';

const TABS: { value: ConsultationStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export function PatientAppointmentsPage() {
  const [sp, setSp] = useSearchParams();
  const status = (sp.get('status') ?? '') as ConsultationStatus | '';
  const page = Number(sp.get('page') ?? 1);

  const query = useQuery({
    queryKey: ['consultations', 'list', { status, page }],
    queryFn: () => consultationsApi.list({ status, page, limit: 10 }),
    placeholderData: (prev) => prev,
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Appointments" description="Every consultation you have booked, past and upcoming." actions={<ButtonLink to="/doctors">Book new</ButtonLink>} />

      <div role="tablist" aria-label="Filter by status" className="flex gap-1 overflow-x-auto rounded-lg border border-line bg-white p-1">
        {TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={status === t.value}
            onClick={() => setSp(t.value ? { status: t.value } : {})}
            className={cn('shrink-0 rounded-md px-3.5 py-2 text-sm font-medium transition-colors', status === t.value ? 'bg-forest text-white' : 'text-ink/75 hover:bg-mint')}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-3" aria-live="polite">
        {query.isPending && [0, 1, 2].map((i) => <CardSkeleton key={i} />)}
        {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
        {query.data?.items.map((c) => (
          <AppointmentCard key={c.id} consultation={c} perspective="patient" href={`/app/appointments/${c.id}`} />
        ))}
        {query.data && query.data.items.length === 0 && (
          <EmptyState icon={CalendarDays} title="No appointments here" description={status ? 'Try another status filter.' : 'Book a consultation to see it listed.'} action={<ButtonLink to="/doctors">Find a doctor</ButtonLink>} />
        )}
      </div>

      {query.data && <Pagination page={query.data.page} totalPages={query.data.totalPages} total={query.data.total} onPageChange={(p) => setSp({ ...(status ? { status } : {}), page: String(p) })} />}
    </div>
  );
}
