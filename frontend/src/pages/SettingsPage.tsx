import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { InlineAlert, describeError } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { authApi, usersApi } from '@/lib/api/endpoints';
import { useAuth } from '@/lib/auth/AuthContext';

const schema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z.string().trim().regex(/^(\+?[0-9]{8,15})?$/, 'Use 8–15 digits').optional().or(z.literal('')),
  timezone: z.string().trim().min(1).max(64),
});
type Values = z.infer<typeof schema>;

export function SettingsPage() {
  const { user, refetchUser } = useAuth();
  const toast = useToast();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { firstName: '', lastName: '', phone: '', timezone: 'Asia/Kolkata' } });

  useEffect(() => {
    if (user?.profile) {
      form.reset({ firstName: user.profile.firstName, lastName: user.profile.lastName, phone: user.profile.phone ?? '', timezone: user.profile.timezone ?? 'Asia/Kolkata' });
    }
  }, [user, form]);

  const save = useMutation({
    mutationFn: (v: Values) => usersApi.updateMe({ ...v, phone: v.phone || undefined }),
    onSuccess: () => {
      toast.success('Profile saved');
      void refetchUser();
    },
    onError: (e) => toast.error('Could not save', describeError(e)),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader title="Account settings" description={user?.email} />
      <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="surface space-y-5 p-6 sm:p-8" noValidate>
        <h2 className="font-display text-xl">Profile</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Input label="First name" error={form.formState.errors.firstName?.message} {...form.register('firstName')} />
          <Input label="Last name" error={form.formState.errors.lastName?.message} {...form.register('lastName')} />
        </div>
        <Input label="Phone" type="tel" error={form.formState.errors.phone?.message} {...form.register('phone')} />
        <Select label="Timezone" {...form.register('timezone')}>
          {['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'UTC'].map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </Select>
        <div className="flex justify-end">
          <Button type="submit" loading={save.isPending}>
            Save
          </Button>
        </div>
      </form>

      {(user?.role === 'DOCTOR' || user?.role === 'ADMIN') && <MfaSection enabled={user.mfaEnabled} onChanged={() => void refetchUser()} />}
    </div>
  );
}

function MfaSection({ enabled, onChanged }: { enabled: boolean; onChanged: () => void }) {
  const toast = useToast();
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState('');

  const start = useMutation({ mutationFn: authApi.mfaSetup, onSuccess: setSetup, onError: (e) => toast.error('Could not start setup', describeError(e)) });
  const enable = useMutation({
    mutationFn: () => authApi.mfaEnable(code),
    onSuccess: () => {
      toast.success('Two-step verification enabled');
      setSetup(null);
      setCode('');
      onChanged();
    },
    onError: (e) => toast.error('Invalid code', describeError(e)),
  });
  const disable = useMutation({
    mutationFn: () => authApi.mfaDisable(code),
    onSuccess: () => {
      toast.success('Two-step verification disabled');
      setCode('');
      onChanged();
    },
    onError: (e) => toast.error('Invalid code', describeError(e)),
  });

  return (
    <section className="surface p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl">Two-step verification</h2>
          <p className="mt-1 text-sm text-muted">Protects accounts that can see other people's medical data. Uses a TOTP authenticator app.</p>
        </div>
        {enabled ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
            <ShieldCheck className="size-4" aria-hidden /> On
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted">
            <ShieldOff className="size-4" aria-hidden /> Off
          </span>
        )}
      </div>

      {!enabled && !setup && (
        <Button className="mt-5" variant="outline" onClick={() => start.mutate()} loading={start.isPending}>
          Set up authenticator
        </Button>
      )}

      {!enabled && setup && (
        <div className="mt-5 space-y-4">
          <InlineAlert tone="info">
            Add this secret to your authenticator app (Google Authenticator, 1Password, Authy), then enter the 6-digit code to finish.
          </InlineAlert>
          <div className="rounded-md border border-line bg-cream p-4">
            <p className="text-xs uppercase tracking-wider text-muted">Secret</p>
            <code className="mt-1 block break-all text-sm">{setup.secret}</code>
            <p className="mt-3 text-xs uppercase tracking-wider text-muted">Setup link</p>
            <a href={setup.otpauthUrl} className="mt-1 block break-all text-sm text-forest underline">
              {setup.otpauthUrl}
            </a>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Input label="6-digit code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} wrapperClassName="sm:w-48" />
            <Button onClick={() => enable.mutate()} loading={enable.isPending} disabled={!/^\d{6}$/.test(code)}>
              Enable
            </Button>
            <Button variant="ghost" onClick={() => setSetup(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {enabled && (
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
          <Input label="Current code to disable" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} wrapperClassName="sm:w-56" />
          <Button variant="danger" onClick={() => disable.mutate()} loading={disable.isPending} disabled={!/^\d{6}$/.test(code)}>
            Disable
          </Button>
        </div>
      )}
    </section>
  );
}
