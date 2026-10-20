import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, Stethoscope, User } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { InlineAlert, describeError } from '@/components/ui/States';
import { authApi } from '@/lib/api/endpoints';
import { homeFor, useAuth } from '@/lib/auth/AuthContext';
import { cn } from '@/lib/utils/cn';
import { AuthLayout } from './AuthLayout';

const schema = z.object({
  role: z.enum(['PATIENT', 'DOCTOR']),
  firstName: z.string().trim().min(1, 'Enter your first name').max(80),
  lastName: z.string().trim().min(1, 'Enter your last name').max(80),
  email: z.string().trim().email('Enter a valid email address'),
  phone: z
    .string()
    .trim()
    .regex(/^(\+?[0-9]{8,15})?$/, 'Use 8–15 digits, optionally starting with +')
    .optional()
    .or(z.literal('')),
  password: z
    .string()
    .min(10, 'Use at least 10 characters')
    .max(128)
    .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), 'Mix letters and numbers'),
});
type Values = z.infer<typeof schema>;

export function RegisterPage() {
  const { login, isAuthenticated, role } = useAuth();
  const navigate = useNavigate();
  const [sp] = useSearchParams();

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { role: sp.get('role') === 'doctor' ? 'DOCTOR' : 'PATIENT', firstName: '', lastName: '', email: '', phone: '', password: '' },
  });
  const selectedRole = form.watch('role');

  const mutation = useMutation({
    mutationFn: (v: Values) => authApi.register({ ...v, phone: v.phone || undefined }),
    onSuccess: (pair) => {
      login(pair);
      navigate(pair.role === 'DOCTOR' ? '/doctor/profile' : homeFor(pair.role), { replace: true });
    },
  });

  if (isAuthenticated) return <Navigate to={homeFor(role)} replace />;

  return (
    <AuthLayout
      title="Create your account"
      subtitle="A few details and you are ready to book your first consultation."
      aside={{
        heading: 'Begin with someone who listens.',
        text: 'Verified doctors, transparent fees and appointment times that respect your schedule.',
        image: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=1400&q=80',
        alt: 'A quiet morning stretch in natural light',
      }}
    >
      <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-5" noValidate>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">I am joining as</legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { value: 'PATIENT', label: 'Patient', icon: User, text: 'Book and attend consultations' },
                { value: 'DOCTOR', label: 'Doctor', icon: Stethoscope, text: 'Offer consultations (after review)' },
              ] as const
            ).map((opt) => (
              <label
                key={opt.value}
                className={cn(
                  'flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition-colors has-[:focus-visible]:shadow-[var(--shadow-ring)]',
                  selectedRole === opt.value ? 'border-forest bg-mint' : 'border-line bg-white hover:bg-mint/50',
                )}
              >
                <input type="radio" value={opt.value} className="sr-only" {...form.register('role')} />
                <span className="inline-flex items-center gap-2 text-sm font-semibold">
                  <opt.icon className="size-4 text-forest" aria-hidden /> {opt.label}
                </span>
                <span className="text-xs text-muted">{opt.text}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-5 sm:grid-cols-2">
          <Input label="First name" autoComplete="given-name" error={form.formState.errors.firstName?.message} {...form.register('firstName')} />
          <Input label="Last name" autoComplete="family-name" error={form.formState.errors.lastName?.message} {...form.register('lastName')} />
        </div>
        <Input label="Email" type="email" autoComplete="email" error={form.formState.errors.email?.message} {...form.register('email')} />
        <Input label="Phone (optional)" type="tel" autoComplete="tel" placeholder="+91…" error={form.formState.errors.phone?.message} {...form.register('phone')} />
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 10 characters with letters and numbers"
          error={form.formState.errors.password?.message}
          {...form.register('password')}
        />
        {mutation.isError && <InlineAlert tone="error">{describeError(mutation.error)}</InlineAlert>}
        <Button type="submit" fullWidth size="lg" loading={mutation.isPending} rightIcon={<ArrowRight className="size-4" />}>
          Create account
        </Button>
        <p className="text-center text-sm text-muted">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-forest hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
