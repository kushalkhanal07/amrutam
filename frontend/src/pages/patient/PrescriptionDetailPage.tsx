import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { PrescriptionView } from '@/components/prescriptions/PrescriptionView';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { prescriptionsApi } from '@/lib/api/endpoints';

export function PrescriptionDetailPage() {
  const { id = '' } = useParams();
  const query = useQuery({ queryKey: ['prescriptions', id], queryFn: () => prescriptionsApi.get(id), enabled: Boolean(id) });
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link to="/app/prescriptions" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-forest print:hidden">
        <ArrowLeft className="size-4" aria-hidden /> All prescriptions
      </Link>
      {query.isPending && <Skeleton className="h-72" />}
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
      {query.data && <PrescriptionView prescription={query.data} />}
    </div>
  );
}
