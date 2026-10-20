import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { InlineAlert, describeError } from '@/components/ui/States';
import { authApi } from '@/lib/api/endpoints';
import type { TokenPair } from '@/lib/api/types';
import { homeFor, useAuth } from '@/lib/auth/AuthContext';
import { AuthLayout } from './AuthLayout';

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});
type LoginValues = z.infer<typeof loginSchema>;

const mfaSchema = z.object({ code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app') });
type MfaValues = z.infer<typeof mfaSchema>;

export function LoginPage() {
  const { login, isAuthenticated, role } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const from = (location.state as { from?: string } | null)?.from;

  const finish = (pair: TokenPair) => {
    login(pair);
    navigate(from && from !== '/login' ? from : homeFor(pair.role), { replace: true });
  };

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (res) => {
      if ('mfaRequired' in res) setMfaToken(res.mfaToken);
      else finish(res);
    },
  });
  const mfaMutation = useMutation({ mutationFn: authApi.verifyMfa, onSuccess: finish });

  const form = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });
  const mfaForm = useForm<MfaValues>({ resolver: zodResolver(mfaSchema), defaultValues: { code: '' } });

  if (isAuthenticated) return <Navigate to={homeFor(role)} replace />;

  return (
    <AuthLayout
      title={mfaToken ? 'Two-step verification' : 'Welcome back'}
      subtitle={mfaToken ? 'Enter the code from your authenticator app to finish signing in.' : 'Sign in to manage your consultations and prescriptions.'}
      aside={{
        heading: 'Care that fits around your day.',
        text: 'Your appointments, consultations and prescriptions, in one calm place.',
        image: 'https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?auto=format&fit=crop&w=1400&q=80',
        alt: 'Fresh herbs and botanicals on a wooden table',
      }}
    >
      {mfaToken ? (
        <form onSubmit={mfaForm.handleSubmit((v) => mfaMutation.mutate({ mfaToken, code: v.code }))} className="space-y-5" noValidate>
          <InlineAlert tone="info">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="size-4" aria-hidden /> This account is protected with two-step verification.
            </span>
          </InlineAlert>
          <Input
            label="Verification code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            autoFocus
            error={mfaForm.formState.errors.code?.message}
            {...mfaForm.register('code')}
          />
          {mfaMutation.isError && <InlineAlert tone="error">{describeError(mfaMutation.error)}</InlineAlert>}
          <Button type="submit" fullWidth size="lg" loading={mfaMutation.isPending} rightIcon={<ArrowRight className="size-4" />}>
            Verify and sign in
          </Button>
          <button type="button" className="w-full text-sm text-muted hover:text-forest" onClick={() => setMfaToken(null)}>
            Use a different account
          </button>
        </form>
      ) : (
        <form onSubmit={form.handleSubmit((v) => loginMutation.mutate(v))} className="space-y-5" noValidate>
          <Input label="Email" type="email" autoComplete="email" placeholder="you@example.com" error={form.formState.errors.email?.message} {...form.register('email')} />
          <Input label="Password" type="password" autoComplete="current-password" placeholder="Your password" error={form.formState.errors.password?.message} {...form.register('password')} />
          {loginMutation.isError && <InlineAlert tone="error">{describeError(loginMutation.error)}</InlineAlert>}
          <Button type="submit" fullWidth size="lg" loading={loginMutation.isPending} rightIcon={<ArrowRight className="size-4" />}>
            Sign in
          </Button>
          <p className="text-center text-sm text-muted">
            New to Amrutam?{' '}
            <Link to="/register" className="font-medium text-forest hover:underline">
              Create an account
            </Link>
          </p>
          <div className="rounded-md border border-dashed border-line bg-white/60 p-3 text-xs text-muted">
            <p className="font-medium text-ink/80">Demo accounts (password <code className="rounded bg-mint px-1">Password123!</code>)</p>
            <p className="mt-1">patient@amrutam.local · dr.meera@amrutam.local · admin@amrutam.local</p>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
