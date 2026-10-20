import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, FileText, PlayCircle, Plus, Trash2, UserX, Video } from 'lucide-react';
import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router';
import { z } from 'zod';
import { PrescriptionView } from '@/components/prescriptions/PrescriptionView';
import { Avatar } from '@/components/ui/Avatar';
import { ConsultationStatusBadge, PaymentStatusBadge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Input, Textarea } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/Modal';
import { ErrorState, InlineAlert, Skeleton, describeError } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { consultationsApi, prescriptionsApi } from '@/lib/api/endpoints';
import { isHttpError } from '@/lib/api/client';
import { formatDate, formatTime, fullName, humanizeStatus } from '@/lib/utils/format';
import { sessionCopy } from '@/pages/consultation/sessionCopy';

const itemSchema = z.object({
  medicationName: z.string().trim().min(1, 'Required').max(200),
  dosage: z.string().trim().min(1, 'Required').max(100),
  frequency: z.string().trim().min(1, 'Required').max(200),
  durationDays: z.coerce.number().int().min(1, 'At least 1 day').max(365),
  notes: z.string().trim().max(500).optional(),
});
const prescriptionSchema = z.object({
  diagnosis: z.string().trim().min(1, 'Enter a diagnosis').max(1000),
  instructions: z.string().trim().max(3000).optional(),
  validUntil: z.string().optional(),
  items: z.array(itemSchema).min(1, 'Add at least one medication').max(30),
});
type PrescriptionValues = z.infer<typeof prescriptionSchema>;

export function DoctorConsultationPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [notes, setNotes] = useState('');
  const [completeOpen, setCompleteOpen] = useState(false);
  const [noShowOpen, setNoShowOpen] = useState(false);

  const query = useQuery({
    queryKey: ['consultations', id],
    queryFn: () => consultationsApi.get(id),
    enabled: Boolean(id),
  });
  const prescription = useQuery({
    queryKey: ['consultations', id, 'prescription'],
    queryFn: () => consultationsApi.prescription(id),
    enabled: Boolean(query.data?.prescription),
    retry: false,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['consultations'] });
  };
  const onError = (title: string) => (err: unknown) => toast.error(title, describeError(err));

  const start = useMutation({
    mutationFn: () => consultationsApi.start(id),
    onSuccess: () => {
      toast.success('Consultation started', 'The patient has been emailed the join link.');
      refresh();
    },
    onError: onError('Could not start'),
  });
  const complete = useMutation({
    mutationFn: () => consultationsApi.complete(id, notes.trim() || undefined),
    onSuccess: () => {
      toast.success('Consultation completed');
      setCompleteOpen(false);
      refresh();
    },
    onError: onError('Could not complete'),
  });
  const noShow = useMutation({
    mutationFn: () => consultationsApi.noShow(id),
    onSuccess: () => {
      toast.success('Marked as no-show');
      setNoShowOpen(false);
      refresh();
    },
    onError: onError('Could not mark no-show'),
  });

  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (query.isPending) return <Skeleton className="h-96" />;
  const c = query.data;
  const paid = c.payment?.status === 'SUCCEEDED';
  const canPrescribe = c.status === 'IN_PROGRESS' || c.status === 'COMPLETED';

  return (
    <div className="space-y-6">
      <Link to="/doctor/schedule" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-forest">
        <ArrowLeft className="size-4" aria-hidden /> Schedule
      </Link>

      <div className="surface p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4">
            <Avatar name={fullName(c.patient.profile)} size="lg" />
            <div>
              <p className="eyebrow">Patient</p>
              <h1 className="font-display text-2xl">{fullName(c.patient.profile)}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <ConsultationStatusBadge status={c.status} />
                {c.payment && <PaymentStatusBadge status={c.payment.status} />}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {c.status === 'SCHEDULED' && (
              <>
                <Button onClick={() => start.mutate()} loading={start.isPending} disabled={!paid} leftIcon={<PlayCircle className="size-4" />} title={paid ? undefined : 'Waiting for payment'}>
                  Start consultation
                </Button>
                <Button variant="outline" onClick={() => setNoShowOpen(true)} leftIcon={<UserX className="size-4" />}>
                  No-show
                </Button>
              </>
            )}
            {c.status === 'IN_PROGRESS' && (
              <Button onClick={() => setCompleteOpen(true)} leftIcon={<CheckCircle2 className="size-4" />}>
                Complete consultation
              </Button>
            )}
          </div>
        </div>

        {c.status === 'SCHEDULED' && !paid && (
          <InlineAlert tone="warning" className="mt-5">
            The patient has not paid yet. The consultation can start once the payment succeeds.
          </InlineAlert>
        )}

        <dl className="mt-6 grid gap-4 border-t border-line pt-6 sm:grid-cols-3">
          <Detail icon={CalendarDays} label="Date" value={formatDate(c.scheduledStartsAt)} />
          <Detail icon={Clock3} label="Time" value={`${formatTime(c.scheduledStartsAt)} – ${formatTime(c.scheduledEndsAt)}`} />
          <Detail icon={Video} label="Type" value={humanizeStatus(c.mode)} />
        </dl>
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-muted">Reason for visit</h2>
          <p className="mt-1 whitespace-pre-line text-ink/90">{c.reasonForVisit ?? 'The patient did not add a reason.'}</p>
        </div>
      </div>

      {c.status === 'IN_PROGRESS' && (
        <div className="surface flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-xl">{sessionCopy(c.mode).title}</h2>
            <p className="text-sm text-muted">The patient has been emailed the same link. Session {c.videoSessionId}.</p>
          </div>
          <ButtonLink to={`/session/${c.id}`} leftIcon={<PlayCircle className="size-4" />}>
            {sessionCopy(c.mode).join}
          </ButtonLink>
        </div>
      )}

      {c.doctorNotes && c.status === 'COMPLETED' && (
        <div className="surface p-6">
          <h2 className="text-sm font-semibold text-muted">Your notes</h2>
          <p className="mt-1 whitespace-pre-line">{c.doctorNotes}</p>
        </div>
      )}

      {/* Prescription */}
      {c.prescription ? (
        prescription.isPending ? (
          <Skeleton className="h-64" />
        ) : prescription.data ? (
          <PrescriptionView prescription={prescription.data} />
        ) : prescription.isError && !isHttpError(prescription.error, 404) ? (
          <ErrorState compact error={prescription.error} onRetry={() => prescription.refetch()} />
        ) : null
      ) : canPrescribe ? (
        <PrescriptionForm consultationId={c.id} onCreated={refresh} />
      ) : (
        <div className="surface flex items-center gap-3 p-5 text-sm text-muted">
          <FileText className="size-5 text-forest" aria-hidden />A prescription can be written once the consultation is in progress.
        </div>
      )}

      <ConfirmDialog
        open={completeOpen}
        onClose={() => setCompleteOpen(false)}
        onConfirm={() => complete.mutate()}
        loading={complete.isPending}
        title="Complete this consultation?"
        description="This closes the consultation. You can still write the prescription afterwards."
        confirmLabel="Complete"
      >
        <Textarea label="Clinical notes (optional)" hint="Stored with the consultation; never written to logs." rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} />
      </ConfirmDialog>
      <ConfirmDialog
        open={noShowOpen}
        onClose={() => setNoShowOpen(false)}
        onConfirm={() => noShow.mutate()}
        loading={noShow.isPending}
        danger
        title="Mark as no-show?"
        description="Only possible after the scheduled start time. This is final."
        confirmLabel="Mark no-show"
      />
    </div>
  );
}

function PrescriptionForm({ consultationId, onCreated }: { consultationId: string; onCreated: () => void }) {
  const toast = useToast();
  const form = useForm<PrescriptionValues>({
    resolver: zodResolver(prescriptionSchema),
    defaultValues: {
      diagnosis: '',
      instructions: '',
      validUntil: '',
      items: [
        {
          medicationName: '',
          dosage: '',
          frequency: '',
          durationDays: 7,
          notes: '',
        },
      ],
    },
  });
  const items = useFieldArray({ control: form.control, name: 'items' });
  const create = useMutation({
    mutationFn: (v: PrescriptionValues) =>
      prescriptionsApi.create({
        consultationId,
        diagnosis: v.diagnosis,
        instructions: v.instructions || undefined,
        validUntil: v.validUntil ? new Date(v.validUntil).toISOString() : undefined,
        items: v.items.map((i) => ({ ...i, notes: i.notes || undefined })),
      }),
    onSuccess: () => {
      toast.success('Prescription issued', 'The patient has been notified.');
      onCreated();
    },
    onError: (err) => toast.error('Could not issue prescription', describeError(err)),
  });

  return (
    <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="surface p-6 sm:p-8" noValidate>
      <h2 className="font-display text-xl">Write prescription</h2>
      <p className="mt-0.5 text-sm text-muted">One prescription per consultation. Review carefully before issuing; it cannot be edited afterwards.</p>
      <div className="mt-5 space-y-5">
        <Input label="Diagnosis" required error={form.formState.errors.diagnosis?.message} {...form.register('diagnosis')} />
        <fieldset className="space-y-4">
          <legend className="text-sm font-medium">Medications</legend>
          {items.fields.map((field, index) => {
            const errs = form.formState.errors.items?.[index];
            return (
              <div key={field.id} className="rounded-lg border border-line bg-cream p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Item {index + 1}</p>
                  {items.fields.length > 1 && (
                    <IconButton label={`Remove item ${index + 1}`} size="sm" onClick={() => items.remove(index)} className="hover:text-error">
                      <Trash2 className="size-4" />
                    </IconButton>
                  )}
                </div>
                <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Input label="Medication" required wrapperClassName="lg:col-span-2" error={errs?.medicationName?.message} {...form.register(`items.${index}.medicationName`)} />
                  <Input label="Dosage" required placeholder="500 mg" error={errs?.dosage?.message} {...form.register(`items.${index}.dosage`)} />
                  <Input label="Duration (days)" required type="number" min={1} max={365} error={errs?.durationDays?.message} {...form.register(`items.${index}.durationDays`)} />
                  <Input
                    label="Frequency"
                    required
                    placeholder="Twice daily after meals"
                    wrapperClassName="sm:col-span-2"
                    error={errs?.frequency?.message}
                    {...form.register(`items.${index}.frequency`)}
                  />
                  <Input label="Notes (optional)" wrapperClassName="sm:col-span-2" error={errs?.notes?.message} {...form.register(`items.${index}.notes`)} />
                </div>
              </div>
            );
          })}
          {form.formState.errors.items?.root?.message && <p className="text-sm text-error">{form.formState.errors.items.root.message}</p>}
          <Button
            type="button"
            variant="outline"
            size="sm"
            leftIcon={<Plus className="size-4" />}
            onClick={() =>
              items.append({
                medicationName: '',
                dosage: '',
                frequency: '',
                durationDays: 7,
                notes: '',
              })
            }
            disabled={items.fields.length >= 30}
          >
            Add medication
          </Button>
        </fieldset>
        <Textarea label="Instructions (optional)" rows={3} error={form.formState.errors.instructions?.message} {...form.register('instructions')} />
        <Input label="Valid until (optional)" type="date" wrapperClassName="sm:max-w-xs" {...form.register('validUntil')} />
      </div>
      <div className="mt-6 flex justify-end">
        <Button type="submit" loading={create.isPending} leftIcon={<FileText className="size-4" />}>
          Issue prescription
        </Button>
      </div>
    </form>
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
