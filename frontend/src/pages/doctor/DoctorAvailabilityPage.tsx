import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format } from 'date-fns';
import { CalendarPlus, Lock, Trash2, Unlock } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { groupSlotsByDay } from '@/components/doctors/SlotPicker';
import { SlotStatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Input, Select } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState, ErrorState, InlineAlert, Skeleton, describeError } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { availabilityApi } from '@/lib/api/endpoints';
import { formatRelativeDay, formatTime } from '@/lib/utils/format';
import { useDoctorProfile } from './useDoctorProfile';

const schema = z
  .object({
    date: z.string().min(1, 'Choose a date'),
    from: z.string().regex(/^\d{2}:\d{2}$/, 'Choose a start time'),
    to: z.string().regex(/^\d{2}:\d{2}$/, 'Choose an end time'),
    durationMinutes: z.coerce.number().int().min(5).max(240),
  })
  .refine((v) => v.to > v.from, { message: 'End time must be after the start time', path: ['to'] });
type Values = z.infer<typeof schema>;

export function DoctorAvailabilityPage() {
  const profile = useDoctorProfile();
  const queryClient = useQueryClient();
  const toast = useToast();
  const tomorrow = addDays(new Date(), 1);

  const slots = useQuery({
    queryKey: ['availability', 'mine'],
    queryFn: () => availabilityApi.mine({ to: addDays(new Date(), 30).toISOString() }),
    enabled: !profile.missing,
  });
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['availability'] });
    void queryClient.invalidateQueries({ queryKey: ['doctors'] });
  };

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { date: format(tomorrow, 'yyyy-MM-dd'), from: '09:00', to: '13:00', durationMinutes: 30 },
  });

  const generate = useMutation({
    mutationFn: (v: Values) =>
      availabilityApi.generate({
        from: new Date(`${v.date}T${v.from}:00`).toISOString(),
        to: new Date(`${v.date}T${v.to}:00`).toISOString(),
        durationMinutes: v.durationMinutes,
      }),
    onSuccess: (created) => {
      toast.success(`${created.length} slot${created.length === 1 ? '' : 's'} added`);
      invalidate();
    },
    onError: (err) => toast.error('Could not add slots', describeError(err)),
  });
  const toggle = useMutation({
    mutationFn: ({ id, block }: { id: string; block: boolean }) => (block ? availabilityApi.block(id) : availabilityApi.unblock(id)),
    onSuccess: invalidate,
    onError: (err) => toast.error('Could not update slot', describeError(err)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => availabilityApi.remove(id),
    onSuccess: () => {
      toast.success('Slot removed');
      invalidate();
    },
    onError: (err) => toast.error('Could not remove slot', describeError(err)),
  });

  if (profile.missing) {
    return <InlineAlert tone="warning">Create your doctor profile first, then add availability.</InlineAlert>;
  }

  const days = groupSlotsByDay(slots.data ?? []);

  return (
    <div className="space-y-8">
      <PageHeader title="Availability" description="Open consultation slots for the next 30 days. Booked slots cannot be removed; cancel the booking instead." />

      <form onSubmit={form.handleSubmit((v) => generate.mutate(v))} className="surface p-6" noValidate>
        <h2 className="font-display text-xl">Add slots</h2>
        <p className="mt-0.5 text-sm text-muted">Split a time range into equal consultation slots (your local time).</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Input label="Date" type="date" min={format(new Date(), 'yyyy-MM-dd')} error={form.formState.errors.date?.message} {...form.register('date')} />
          <Input label="From" type="time" step={300} error={form.formState.errors.from?.message} {...form.register('from')} />
          <Input label="To" type="time" step={300} error={form.formState.errors.to?.message} {...form.register('to')} />
          <Select label="Slot length" error={form.formState.errors.durationMinutes?.message} {...form.register('durationMinutes')}>
            <option value={15}>15 minutes</option>
            <option value={20}>20 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={45}>45 minutes</option>
            <option value={60}>60 minutes</option>
          </Select>
          <div className="flex items-end">
            <Button type="submit" fullWidth loading={generate.isPending} leftIcon={<CalendarPlus className="size-4" />}>
              Add slots
            </Button>
          </div>
        </div>
      </form>

      <section aria-live="polite">
        <h2 className="font-display text-xl">Upcoming slots</h2>
        <div className="mt-4 space-y-4">
          {slots.isPending && <Skeleton className="h-40" />}
          {slots.isError && <ErrorState compact error={slots.error} onRetry={() => slots.refetch()} />}
          {slots.data && days.length === 0 && <EmptyState compact icon={CalendarPlus} title="No slots in the next 30 days" description="Add a range above to start accepting bookings." />}
          {days.map((day) => (
            <div key={day.date.toISOString()} className="surface overflow-hidden">
              <h3 className="border-b border-line bg-mint/60 px-5 py-2.5 text-sm font-semibold">
                {formatRelativeDay(day.date)} · {format(day.date, 'd MMM yyyy')}
                <span className="ml-2 font-normal text-muted">
                  {day.slots.filter((s) => s.status === 'AVAILABLE').length} open · {day.slots.filter((s) => s.status === 'BOOKED').length} booked
                </span>
              </h3>
              <ul className="divide-y divide-line">
                {day.slots.map((s) => (
                  <li key={s.id} className="flex items-center gap-4 px-5 py-2.5">
                    <span className="w-36 text-sm font-medium">
                      {formatTime(s.startsAt)} – {formatTime(s.endsAt)}
                    </span>
                    <SlotStatusBadge status={s.status} />
                    <span className="ml-auto flex gap-1">
                      {s.status !== 'BOOKED' && (
                        <IconButton
                          label={s.status === 'BLOCKED' ? 'Unblock slot' : 'Block slot'}
                          size="sm"
                          disabled={toggle.isPending}
                          onClick={() => toggle.mutate({ id: s.id, block: s.status === 'AVAILABLE' })}
                        >
                          {s.status === 'BLOCKED' ? <Unlock className="size-4" /> : <Lock className="size-4" />}
                        </IconButton>
                      )}
                      {s.status !== 'BOOKED' && (
                        <IconButton label="Delete slot" size="sm" disabled={remove.isPending} onClick={() => remove.mutate(s.id)} className="hover:text-error">
                          <Trash2 className="size-4" />
                        </IconButton>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
