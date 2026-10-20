import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { VerificationBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { ErrorState, InlineAlert, Skeleton, describeError } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { doctorsApi } from '@/lib/api/endpoints';
import { useDoctorProfile } from './useDoctorProfile';

const schema = z.object({
  specialization: z.string().trim().min(2, 'At least 2 characters').max(80),
  qualifications: z.string().trim().max(400).optional(),
  languages: z.string().trim().max(200).optional(),
  yearsOfExperience: z.coerce.number().int().min(0).max(70),
  fee: z.coerce.number().min(0, 'Fee cannot be negative').max(1_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Three-letter code, e.g. INR'),
  bio: z.string().trim().max(2000).optional(),
});
type Values = z.infer<typeof schema>;

const splitList = (s?: string) =>
  (s ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

export function DoctorProfileSetupPage() {
  const profile = useDoctorProfile();
  const queryClient = useQueryClient();
  const toast = useToast();

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { specialization: '', qualifications: '', languages: 'en', yearsOfExperience: 0, fee: 500, currency: 'INR', bio: '' },
  });

  useEffect(() => {
    if (profile.data) {
      form.reset({
        specialization: profile.data.specialization,
        qualifications: profile.data.qualifications.join(', '),
        languages: profile.data.languages.join(', '),
        yearsOfExperience: profile.data.yearsOfExperience,
        fee: profile.data.consultationFeeMinor / 100,
        currency: profile.data.currency,
        bio: profile.data.bio ?? '',
      });
    }
  }, [profile.data, form]);

  const save = useMutation({
    mutationFn: (v: Values) => {
      const body = {
        specialization: v.specialization,
        qualifications: splitList(v.qualifications),
        languages: splitList(v.languages),
        yearsOfExperience: v.yearsOfExperience,
        consultationFeeMinor: Math.round(v.fee * 100),
        currency: v.currency,
        bio: v.bio || undefined,
      };
      return profile.missing ? doctorsApi.createMe(body) : doctorsApi.updateMe(body);
    },
    onSuccess: () => {
      toast.success(profile.missing ? 'Profile created' : 'Profile saved', profile.missing ? 'An administrator will review it before you appear in search.' : undefined);
      void queryClient.invalidateQueries({ queryKey: ['doctors'] });
    },
    onError: (err) => toast.error('Could not save', describeError(err)),
  });

  if (profile.isPending) return <Skeleton className="h-96" />;
  if (profile.isError && !profile.missing) return <ErrorState error={profile.error} onRetry={() => profile.refetch()} />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={profile.missing ? 'Set up your doctor profile' : 'My profile'}
        description={profile.missing ? 'Patients see this in the directory once an administrator verifies you.' : 'What patients see in the directory and on your profile page.'}
        actions={profile.data ? <VerificationBadge status={profile.data.verificationStatus} /> : undefined}
      />

      {profile.data?.verificationStatus === 'PENDING' && (
        <InlineAlert tone="warning">Your profile is awaiting review. You can prepare availability now; patients can book once you are verified.</InlineAlert>
      )}
      {profile.data?.verificationStatus === 'REJECTED' && <InlineAlert tone="error">Your profile was not approved. Please update it and contact support.</InlineAlert>}

      <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="surface space-y-5 p-6 sm:p-8" noValidate>
        <div className="grid gap-5 sm:grid-cols-2">
          <Input label="Specialty" required placeholder="e.g. Ayurveda" error={form.formState.errors.specialization?.message} {...form.register('specialization')} />
          <Input label="Years of experience" type="number" min={0} max={70} error={form.formState.errors.yearsOfExperience?.message} {...form.register('yearsOfExperience')} />
        </div>
        <Input label="Qualifications" hint="Comma-separated, e.g. BAMS, MD" error={form.formState.errors.qualifications?.message} {...form.register('qualifications')} />
        <Input label="Languages" hint="Comma-separated language codes, e.g. en, hi" error={form.formState.errors.languages?.message} {...form.register('languages')} />
        <div className="grid gap-5 sm:grid-cols-[1fr_140px]">
          <Input label="Consultation fee" type="number" min={0} step="1" hint="Per consultation, in the main currency unit" error={form.formState.errors.fee?.message} {...form.register('fee')} />
          <Select label="Currency" error={form.formState.errors.currency?.message} {...form.register('currency')}>
            <option value="INR">INR</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </Select>
        </div>
        <Textarea label="Bio" rows={5} placeholder="How you practise, what patients can expect from a consultation." error={form.formState.errors.bio?.message} {...form.register('bio')} />
        <div className="flex justify-end">
          <Button type="submit" loading={save.isPending}>
            {profile.missing ? 'Create profile' : 'Save changes'}
          </Button>
        </div>
      </form>
    </div>
  );
}
