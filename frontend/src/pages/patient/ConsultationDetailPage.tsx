import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, Clock3, CreditCard, FileText, PlayCircle, Video, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { doctorDisplayName } from '@/components/doctors/DoctorCard';
import { Avatar } from '@/components/ui/Avatar';
import { ConsultationStatusBadge, PaymentStatusBadge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/Modal';
import { ErrorState, InlineAlert, Skeleton, describeError } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { bookingsApi, consultationsApi } from '@/lib/api/endpoints';
import { formatDate, formatDateTime, formatMoney, formatTime, fullName, humanizeStatus } from '@/lib/utils/format';
import { sessionCopy } from '@/pages/consultation/sessionCopy';

export function ConsultationDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');

  const query = useQuery({
    queryKey: ['consultations', id],
    queryFn: () => consultationsApi.get(id),
    enabled: Boolean(id),
  });
  const cancel = useMutation({
    mutationFn: () => bookingsApi.cancel(id, reason.trim() || undefined),
    onSuccess: () => {
      toast.success('Appointment cancelled', 'Your slot has been released. Any payment is refunded or voided.');
      setCancelOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['consultations'] });
    },
    onError: (err) => toast.error('Could not cancel', describeError(err)),
  });

  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (query.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-32" />
      </div>
    );
  }
  const c = query.data;
  const canCancel = c.status === 'SCHEDULED';
  const needsPayment = c.status === 'SCHEDULED' && c.payment && c.payment.status !== 'SUCCEEDED';

  return (
    <div className="space-y-6">
      <Link to="/app/appointments" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-forest">
        <ArrowLeft className="size-4" aria-hidden /> All appointments
      </Link>

      <div className="surface p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4">
            <Avatar name={fullName(c.doctor.user.profile)} size="lg" />
            <div>
              <p className="eyebrow">{c.doctor.specialization}</p>
              <h1 className="font-display text-2xl">{doctorDisplayName(c.doctor)}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <ConsultationStatusBadge status={c.status} />
                {c.payment && <PaymentStatusBadge status={c.payment.status} />}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {needsPayment && (
              <ButtonLink to={`/app/appointments/${c.id}/pay`} leftIcon={<CreditCard className="size-4" />}>
                Pay {c.payment ? formatMoney(c.payment.amountMinor, c.payment.currency) : ''}
              </ButtonLink>
            )}
            {canCancel && (
              <Button variant="outline" onClick={() => setCancelOpen(true)} leftIcon={<XCircle className="size-4" />}>
                Cancel
              </Button>
            )}
          </div>
        </div>

        <dl className="mt-6 grid gap-4 border-t border-line pt-6 sm:grid-cols-3">
          <Detail icon={CalendarDays} label="Date" value={formatDate(c.scheduledStartsAt)} />
          <Detail icon={Clock3} label="Time" value={`${formatTime(c.scheduledStartsAt)} – ${formatTime(c.scheduledEndsAt)}`} />
          <Detail icon={Video} label="Type" value={humanizeStatus(c.mode)} />
        </dl>

        {c.reasonForVisit && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-muted">Reason for visit</h2>
            <p className="mt-1 whitespace-pre-line text-ink/90">{c.reasonForVisit}</p>
          </div>
        )}
      </div>

      {c.status === 'IN_PROGRESS' && (
        <div className="surface flex flex-col gap-4 border-forest/30 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-xl">{sessionCopy(c.mode).title}</h2>
            <p className="text-sm text-muted">{doctorDisplayName(c.doctor)} has started your consultation. The same link was sent to your email.</p>
          </div>
          <ButtonLink to={`/session/${c.id}`} leftIcon={<PlayCircle className="size-4" />}>
            {sessionCopy(c.mode).join}
          </ButtonLink>
        </div>
      )}

      {c.status === 'CANCELLED' && (
        <InlineAlert tone="warning">
          Cancelled {c.cancelledAt ? `on ${formatDateTime(c.cancelledAt)}` : ''}
          {c.cancellationReason ? ` · Reason: ${c.cancellationReason}` : ''}
          {c.payment?.status === 'REFUNDED' ? ' · Payment refunded.' : c.payment?.status === 'FAILED' ? ' · No charge was made.' : ''}
        </InlineAlert>
      )}

      {c.status === 'COMPLETED' && (
        <div className="surface p-6">
          <h2 className="font-display text-xl">After your visit</h2>
          {c.doctorNotes && (
            <div className="mt-3">
              <h3 className="text-sm font-semibold text-muted">Doctor's notes</h3>
              <p className="mt-1 whitespace-pre-line text-ink/90">{c.doctorNotes}</p>
            </div>
          )}
          <div className="mt-4">
            {c.prescription ? (
              <ButtonLink to={`/app/prescriptions/${c.prescription.id}`} variant="outline" leftIcon={<FileText className="size-4" />}>
                View prescription
              </ButtonLink>
            ) : (
              <p className="text-sm text-muted">No prescription was issued for this consultation.</p>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => cancel.mutate()}
        loading={cancel.isPending}
        danger
        title="Cancel this appointment?"
        description="The slot will be released for other patients. A paid consultation is refunded."
        confirmLabel="Cancel appointment"
        cancelLabel="Keep it"
      >
        <Textarea label="Reason (optional)" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      </ConfirmDialog>
    </div>
  );
}

function Detail({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 text-forest" aria-hidden />
      <div>
        <dt className="text-xs text-muted">{label}</dt>
        <dd className="font-medium">{value}</dd>
      </div>
    </div>
  );
}
