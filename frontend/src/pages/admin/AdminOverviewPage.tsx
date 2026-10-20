import { useQuery } from '@tanstack/react-query';
import { addDays } from 'date-fns';
import { useState } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/ui/PageHeader';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { Table, Td, Th } from '@/components/ui/Table';
import { adminApi } from '@/lib/api/endpoints';
import type { ConsultationStatus } from '@/lib/api/types';
import { cn } from '@/lib/utils/cn';
import { formatMoney, humanizeStatus } from '@/lib/utils/format';

const RANGES = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
];

const STATUS_ORDER: ConsultationStatus[] = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];
const STATUS_COLOR: Record<ConsultationStatus, string> = {
  SCHEDULED: 'bg-forest',
  IN_PROGRESS: 'bg-amber',
  COMPLETED: 'bg-success',
  CANCELLED: 'bg-muted',
  NO_SHOW: 'bg-error',
};

export function AdminOverviewPage() {
  const [days, setDays] = useState(30);
  // Include the coming week so scheduled bookings and future slots appear.
  const params = { from: addDays(new Date(), -days).toISOString(), to: addDays(new Date(), 7).toISOString() };
  const overview = useQuery({ queryKey: ['admin', 'overview', days], queryFn: () => adminApi.overview(params) });
  const doctors = useQuery({ queryKey: ['admin', 'doctors', days], queryFn: () => adminApi.doctors({ ...params, limit: 10 }) });

  const o = overview.data;
  const revenue = o ? Object.entries(o.payments.grossRevenueMinorByCurrency) : [];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Overview"
        description="Live aggregates from the analytics endpoints. Bookings are counted by creation date; slots by start time."
        actions={
          <div role="group" aria-label="Date range" className="flex rounded-md border border-line bg-white p-0.5">
            {RANGES.map((r) => (
              <button key={r.days} type="button" aria-pressed={days === r.days} onClick={() => setDays(r.days)} className={cn('rounded px-3 py-1.5 text-sm font-medium', days === r.days ? 'bg-forest text-white' : 'text-ink/75 hover:bg-mint')}>
                {r.label}
              </button>
            ))}
          </div>
        }
      />

      {overview.isError && <ErrorState error={overview.error} onRetry={() => overview.refetch()} />}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Key metrics">
        <Metric label="Bookings" value={o?.bookings.total} loading={overview.isPending} />
        <Metric label="Cancellations" value={o?.bookings.cancellations} loading={overview.isPending} />
        <Metric label="Slot utilization" value={o ? `${Math.round(o.slots.utilization * 100)}%` : undefined} sub={o ? `${o.slots.byStatus.BOOKED} of ${o.slots.total} slots` : undefined} loading={overview.isPending} />
        <Metric
          label="Gross revenue"
          value={revenue.length ? revenue.map(([cur, minor]) => formatMoney(minor, cur)).join(' · ') : o ? '—' : undefined}
          sub={o ? `${o.payments.byStatus.SUCCEEDED ?? 0} paid · ${o.payments.byStatus.REFUNDED ?? 0} refunded` : undefined}
          loading={overview.isPending}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="surface p-6">
          <h2 className="font-display text-xl">Consultations by status</h2>
          {overview.isPending ? (
            <Skeleton className="mt-4 h-40" />
          ) : o ? (
            <StatusBars total={o.bookings.total} byStatus={o.bookings.byStatus} />
          ) : null}
        </section>
        <section className="surface p-6">
          <h2 className="font-display text-xl">New users</h2>
          {overview.isPending ? (
            <Skeleton className="mt-4 h-40" />
          ) : o ? (
            <dl className="mt-4 grid grid-cols-3 gap-4">
              {(['PATIENT', 'DOCTOR', 'ADMIN'] as const).map((r) => (
                <div key={r} className="rounded-lg bg-cream p-4">
                  <dt className="text-xs uppercase tracking-wider text-muted">{r.toLowerCase()}s</dt>
                  <dd className="font-display mt-1 text-2xl">{o.newUsers[r] ?? 0}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {o && (
            <dl className="mt-6 space-y-1.5 text-sm">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Payments</h3>
              {Object.entries(o.payments.byStatus).map(([s, n]) => (
                <div key={s} className="flex justify-between">
                  <dt className="text-muted">{humanizeStatus(s)}</dt>
                  <dd className="font-medium">{n}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      </div>

      <section>
        <div className="flex items-end justify-between">
          <h2 className="font-display text-xl">Doctor utilization</h2>
          <Link to="/admin/doctors" className="text-sm font-medium text-forest hover:underline">
            Manage doctors
          </Link>
        </div>
        {doctors.isPending && <Skeleton className="mt-4 h-48" />}
        {doctors.isError && <ErrorState compact error={doctors.error} onRetry={() => doctors.refetch()} />}
        {doctors.data && (
          <Table className="mt-4">
            <thead>
              <tr>
                <Th>Doctor</Th>
                <Th>Slots</Th>
                <Th>Booked</Th>
                <Th>Utilization</Th>
                <Th>Completed</Th>
                <Th>Cancelled</Th>
                <Th>No-show</Th>
              </tr>
            </thead>
            <tbody>
              {doctors.data.items.map((d) => (
                <tr key={d.doctorId}>
                  <Td>
                    <span className="block font-medium">{d.name || 'Unnamed'}</span>
                    <span className="text-muted">{d.specialization}</span>
                  </Td>
                  <Td>{d.totalSlots}</Td>
                  <Td>{d.bookedSlots}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-mint" aria-hidden>
                        <div className="h-full rounded-full bg-forest" style={{ width: `${Math.round(d.utilization * 100)}%` }} />
                      </div>
                      <span>{Math.round(d.utilization * 100)}%</span>
                    </div>
                  </Td>
                  <Td>{d.consultations.completed}</Td>
                  <Td>{d.consultations.cancelled}</Td>
                  <Td>{d.consultations.noShow}</Td>
                </tr>
              ))}
              {doctors.data.items.length === 0 && (
                <tr>
                  <Td className="text-center text-muted" colSpan={7}>
                    No doctors yet.
                  </Td>
                </tr>
              )}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value, sub, loading }: { label: string; value?: string | number; sub?: string; loading?: boolean }) {
  return (
    <div className="surface p-5">
      <p className="text-sm text-muted">{label}</p>
      {loading ? <Skeleton className="mt-2 h-8 w-24" /> : <p className="font-display mt-1 text-2xl">{value ?? '–'}</p>}
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}

function StatusBars({ total, byStatus }: { total: number; byStatus: Record<ConsultationStatus, number> }) {
  return (
    <ul className="mt-4 space-y-3">
      {STATUS_ORDER.map((s) => {
        const n = byStatus[s] ?? 0;
        const pct = total ? Math.round((n / total) * 100) : 0;
        return (
          <li key={s}>
            <div className="flex justify-between text-sm">
              <span className="font-medium">{humanizeStatus(s)}</span>
              <span className="text-muted">
                {n} · {pct}%
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-mint" role="img" aria-label={`${humanizeStatus(s)}: ${n} (${pct}%)`}>
              <div className={cn('h-full rounded-full transition-[width]', STATUS_COLOR[s])} style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
      {total === 0 && <li className="text-sm text-muted">No consultations in this range.</li>}
    </ul>
  );
}
