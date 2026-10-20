import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays } from 'date-fns';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { VerificationBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState, ErrorState, Skeleton, describeError } from '@/components/ui/States';
import { Pagination, Table, Td, Th } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { adminApi, doctorsApi } from '@/lib/api/endpoints';
import type { DoctorVerificationStatus } from '@/lib/api/types';
import { formatMoney } from '@/lib/utils/format';

/**
 * Lists every doctor (verified or not) via the utilization endpoint, then loads
 * each profile for its verification status. Admins verify or reject from here.
 */
export function AdminDoctorsPage() {
  const [sp, setSp] = useSearchParams();
  const page = Number(sp.get('page') ?? 1);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [pending, setPending] = useState<{ id: string; name: string; status: DoctorVerificationStatus } | null>(null);

  const list = useQuery({
    queryKey: ['admin', 'doctors', 'all', page],
    queryFn: () => adminApi.doctors({ from: addDays(new Date(), -30).toISOString(), to: addDays(new Date(), 30).toISOString(), page, limit: 20 }),
    placeholderData: (p) => p,
  });
  const profiles = useQueries({
    queries: (list.data?.items ?? []).map((d) => ({ queryKey: ['doctors', d.doctorId], queryFn: () => doctorsApi.get(d.doctorId) })),
  });

  const verify = useMutation({
    mutationFn: ({ id, status }: { id: string; status: DoctorVerificationStatus }) => doctorsApi.setVerification(id, status),
    onSuccess: () => {
      toast.success('Verification updated');
      setPending(null);
      void queryClient.invalidateQueries({ queryKey: ['doctors'] });
    },
    onError: (e) => toast.error('Failed', describeError(e)),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Doctors" description="Review new doctor profiles. Only verified doctors appear in the public directory and can be booked." />
      {list.isPending && <Skeleton className="h-72" />}
      {list.isError && <ErrorState error={list.error} onRetry={() => list.refetch()} />}
      {list.data && list.data.items.length === 0 && <EmptyState title="No doctor profiles yet" />}
      {list.data && list.data.items.length > 0 && (
        <Table>
          <thead>
            <tr>
              <Th>Doctor</Th>
              <Th>Fee</Th>
              <Th>Slots (±30d)</Th>
              <Th>Verification</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {list.data.items.map((d, i) => {
              const p = profiles[i];
              const status = p?.data?.verificationStatus;
              return (
                <tr key={d.doctorId}>
                  <Td>
                    <Link to={`/doctors/${d.doctorId}`} className="font-medium hover:text-forest hover:underline">
                      {d.name || 'Unnamed'}
                    </Link>
                    <span className="block text-muted">{d.specialization}</span>
                  </Td>
                  <Td>{p?.data ? formatMoney(p.data.consultationFeeMinor, p.data.currency) : <Skeleton className="h-4 w-16" />}</Td>
                  <Td>
                    {d.totalSlots} <span className="text-muted">({d.bookedSlots} booked)</span>
                  </Td>
                  <Td>{status ? <VerificationBadge status={status} /> : <Skeleton className="h-5 w-20" />}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      {status !== 'VERIFIED' && (
                        <Button size="sm" onClick={() => setPending({ id: d.doctorId, name: d.name, status: 'VERIFIED' })} disabled={!status}>
                          Verify
                        </Button>
                      )}
                      {status !== 'REJECTED' && (
                        <Button size="sm" variant="outline" onClick={() => setPending({ id: d.doctorId, name: d.name, status: 'REJECTED' })} disabled={!status}>
                          Reject
                        </Button>
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      {list.data && <Pagination page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} onPageChange={(p) => setSp({ page: String(p) })} />}

      <ConfirmDialog
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        onConfirm={() => pending && verify.mutate({ id: pending.id, status: pending.status })}
        loading={verify.isPending}
        danger={pending?.status === 'REJECTED'}
        title={pending?.status === 'VERIFIED' ? `Verify ${pending.name}?` : `Reject ${pending?.name}?`}
        description={pending?.status === 'VERIFIED' ? 'They will appear in the directory and accept bookings.' : 'They will be hidden from the directory and cannot be booked.'}
        confirmLabel={pending?.status === 'VERIFIED' ? 'Verify' : 'Reject'}
      />
    </div>
  );
}
