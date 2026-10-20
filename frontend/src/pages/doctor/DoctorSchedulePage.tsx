import { useQuery } from '@tanstack/react-query';
import { CalendarDays } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { ConsultationStatusBadge, PaymentStatusBadge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { Pagination, Table, Td, Th } from '@/components/ui/Table';
import { consultationsApi } from '@/lib/api/endpoints';
import type { ConsultationStatus } from '@/lib/api/types';
import { cn } from '@/lib/utils/cn';
import { formatDate, formatTime, fullName, humanizeStatus } from '@/lib/utils/format';

const TABS: { value: ConsultationStatus | ''; label: string }[] = [
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'NO_SHOW', label: 'No-show' },
  { value: '', label: 'All' },
];

export function DoctorSchedulePage() {
  const [sp, setSp] = useSearchParams();
  const status = (sp.get('status') ?? 'SCHEDULED') as ConsultationStatus | '';
  const page = Number(sp.get('page') ?? 1);
  const query = useQuery({
    queryKey: ['consultations', 'schedule', { status, page }],
    queryFn: () => consultationsApi.list({ status, page, limit: 15 }),
    placeholderData: (p) => p,
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Schedule" description="All consultations booked with you." />
      <div role="tablist" aria-label="Filter by status" className="flex gap-1 overflow-x-auto rounded-lg border border-line bg-white p-1">
        {TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={status === t.value}
            onClick={() => setSp({ status: t.value })}
            className={cn('shrink-0 rounded-md px-3.5 py-2 text-sm font-medium transition-colors', status === t.value ? 'bg-forest text-white' : 'text-ink/75 hover:bg-mint')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {query.isPending && <Skeleton className="h-64" />}
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
      {query.data && query.data.items.length === 0 && <EmptyState icon={CalendarDays} title="No consultations" description="Nothing matches this filter yet." />}
      {query.data && query.data.items.length > 0 && (
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Patient</Th>
              <Th>Type</Th>
              <Th>Payment</Th>
              <Th>Status</Th>
              <Th className="text-right">
                <span className="sr-only">Open</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {query.data.items.map((c) => (
              <tr key={c.id} className="hover:bg-mint/40">
                <Td>
                  <span className="block font-medium">{formatDate(c.scheduledStartsAt)}</span>
                  <span className="text-muted">
                    {formatTime(c.scheduledStartsAt)} – {formatTime(c.scheduledEndsAt)}
                  </span>
                </Td>
                <Td>
                  <span className="block font-medium">{fullName(c.patient.profile)}</span>
                  <span className="block max-w-[240px] truncate text-muted">{c.reasonForVisit ?? '—'}</span>
                </Td>
                <Td>{humanizeStatus(c.mode)}</Td>
                <Td>{c.payment ? <PaymentStatusBadge status={c.payment.status} /> : '—'}</Td>
                <Td>
                  <ConsultationStatusBadge status={c.status} />
                </Td>
                <Td className="text-right">
                  <Link to={`/doctor/consultations/${c.id}`} className="text-sm font-medium text-forest hover:underline">
                    Open
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {query.data && <Pagination page={query.data.page} totalPages={query.data.totalPages} total={query.data.total} onPageChange={(p) => setSp({ status, page: String(p) })} />}
    </div>
  );
}
