import { useQuery } from '@tanstack/react-query';
import { ArrowRight, FileText } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/ui/PageHeader';
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/States';
import { Pagination } from '@/components/ui/Table';
import { prescriptionsApi } from '@/lib/api/endpoints';
import { useAuth } from '@/lib/auth/AuthContext';
import { formatDate, fullName } from '@/lib/utils/format';

export function PrescriptionsPage() {
  const { role } = useAuth();
  const [sp, setSp] = useSearchParams();
  const page = Number(sp.get('page') ?? 1);
  const query = useQuery({ queryKey: ['prescriptions', { page }], queryFn: () => prescriptionsApi.list({ page, limit: 10 }), placeholderData: (p) => p });
  const base = role === 'DOCTOR' ? '/doctor/consultations' : '/app/prescriptions';

  return (
    <div className="space-y-6">
      <PageHeader title="Prescriptions" description="Issued by your doctors after a consultation. Keep them for your records." />
      <div className="space-y-3" aria-live="polite">
        {query.isPending && [0, 1].map((i) => <CardSkeleton key={i} />)}
        {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
        {query.data?.items.map((p) => (
          <Link
            key={p.id}
            to={role === 'DOCTOR' ? `${base}/${p.consultationId}` : `${base}/${p.id}`}
            className="surface flex items-center gap-4 p-5 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] focus-visible:outline-none focus-visible:shadow-[var(--shadow-ring)]"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-mint text-forest">
              <FileText className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-display block truncate text-lg">{p.diagnosis}</span>
              <span className="block text-sm text-muted">
                Dr. {fullName(p.doctor.user.profile)} · {p.doctor.specialization} · {formatDate(p.issuedAt)} · {p.items.length} item{p.items.length === 1 ? '' : 's'}
              </span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-muted" aria-hidden />
          </Link>
        ))}
        {query.data && query.data.items.length === 0 && <EmptyState icon={FileText} title="No prescriptions yet" description="Prescriptions issued during your consultations will appear here." />}
      </div>
      {query.data && <Pagination page={query.data.page} totalPages={query.data.totalPages} total={query.data.total} onPageChange={(p) => setSp({ page: String(p) })} />}
    </div>
  );
}
