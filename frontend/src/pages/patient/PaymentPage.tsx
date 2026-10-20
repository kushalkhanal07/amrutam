import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, CreditCard, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { doctorDisplayName } from '@/components/doctors/DoctorCard';
import { PaymentStatusBadge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ErrorState, InlineAlert, Skeleton, describeError } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { isHttpError } from '@/lib/api/client';
import { consultationsApi, paymentsApi } from '@/lib/api/endpoints';
import type { PaymentIntent } from '@/lib/api/types';
import { formatDate, formatMoney, formatTime } from '@/lib/utils/format';

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
let stripePromise: Promise<Stripe | null> | null = null;
function getStripe() {
  if (!publishableKey) return null;
  if (!stripePromise) stripePromise = loadStripe(publishableKey);
  return stripePromise;
}

export function PaymentPage() {
  const { id = '' } = useParams();
  const [sp] = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const returned = sp.get('redirect_status'); // set by Stripe after a redirect flow
  const [intent, setIntent] = useState<PaymentIntent | null>(null);

  const consultation = useQuery({
    queryKey: ['consultations', id],
    queryFn: () => consultationsApi.get(id),
    enabled: Boolean(id),
  });

  const refreshed = () => {
    void queryClient.invalidateQueries({ queryKey: ['consultations'] });
  };

  // Reconcile with the provider: used after a Stripe confirmation and after a redirect return.
  const sync = useMutation({
    mutationFn: (paymentId: string) => paymentsApi.sync(paymentId),
    onSuccess: (payment) => {
      refreshed();
      if (payment.status === 'SUCCEEDED') setIntent(null);
    },
    onError: (err) => toast.error('Could not verify the payment', describeError(err)),
  });

  const createIntent = useMutation({
    mutationFn: () => paymentsApi.createIntent(id),
    onSuccess: setIntent,
    onError: (err) => {
      // 409 "already succeeded": the backend just recorded the payment; show the paid state.
      if (isHttpError(err, 409)) refreshed();
      else toast.error('Could not start payment', describeError(err));
    },
  });

  const paymentId = consultation.data?.payment?.id;
  const paymentStatus = consultation.data?.payment?.status;
  useEffect(() => {
    if (returned && paymentId && paymentStatus === 'PROCESSING' && !sync.isPending && !sync.isSuccess) {
      sync.mutate(paymentId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returned, paymentId, paymentStatus]);

  const paid = paymentStatus === 'SUCCEEDED';

  if (consultation.isError) return <ErrorState error={consultation.error} onRetry={() => consultation.refetch()} />;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link to={`/app/appointments/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-forest">
        <ArrowLeft className="size-4" aria-hidden /> Back to appointment
      </Link>

      <div className="surface p-6 sm:p-8">
        <p className="eyebrow">Payment</p>
        {consultation.isPending ? (
          <div className="mt-3 space-y-3">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : (
          <>
            <h1 className="font-display mt-1 text-2xl">Consultation with {doctorDisplayName(consultation.data.doctor)}</h1>
            <p className="text-muted">
              {formatDate(consultation.data.scheduledStartsAt)} · {formatTime(consultation.data.scheduledStartsAt)}
            </p>
            {consultation.data.payment && (
              <div className="mt-5 flex items-center justify-between rounded-lg border border-line bg-cream p-4">
                <div>
                  <p className="text-sm text-muted">Amount due</p>
                  <p className="font-display text-2xl">{formatMoney(consultation.data.payment.amountMinor, consultation.data.payment.currency)}</p>
                </div>
                <PaymentStatusBadge status={consultation.data.payment.status} />
              </div>
            )}
          </>
        )}

        {paid && (
          <div className="mt-6 text-center">
            <CheckCircle2 className="mx-auto size-12 text-success" aria-hidden />
            <h2 className="font-display mt-3 text-xl">Payment received</h2>
            <p className="mt-1 text-muted">Your doctor can now start the consultation at the scheduled time.</p>
            <ButtonLink to={`/app/appointments/${id}`} className="mt-5">
              Back to appointment
            </ButtonLink>
          </div>
        )}

        {!paid && consultation.data && consultation.data.status !== 'SCHEDULED' && (
          <InlineAlert tone="warning" className="mt-6">
            This consultation is {consultation.data.status.toLowerCase().replace('_', ' ')}; payment is no longer possible.
          </InlineAlert>
        )}

        {!paid && consultation.data?.status === 'SCHEDULED' && !intent && (
          <div className="mt-6">
            {sync.isPending && <InlineAlert tone="info" className="mb-4">Checking the payment status with the provider…</InlineAlert>}
            <Button size="lg" fullWidth loading={createIntent.isPending} onClick={() => createIntent.mutate()} leftIcon={<CreditCard className="size-4" />}>
              Continue to payment
            </Button>
            <p className="mt-3 flex items-start gap-2 text-xs text-muted">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-forest" aria-hidden />
              Card details are handled by the payment provider and never reach Amrutam's servers.
            </p>
          </div>
        )}

        {!paid && intent && intent.provider === 'MOCK' && <MockCheckout intent={intent} onDone={refreshed} />}
        {!paid && intent && intent.provider === 'STRIPE' && (
          <StripeCheckout
            intent={intent}
            returnUrl={`${window.location.origin}/app/appointments/${id}/pay`}
            onConfirmed={() => sync.mutate(intent.paymentId)}
          />
        )}
      </div>
    </div>
  );
}

function MockCheckout({ intent, onDone }: { intent: PaymentIntent; onDone: () => void }) {
  const toast = useToast();
  const confirm = useMutation({
    mutationFn: (outcome: 'succeeded' | 'failed') => paymentsApi.mockConfirm(intent.paymentId, outcome),
    onSuccess: (res, outcome) => {
      if (outcome === 'succeeded') toast.success('Payment simulated', res.duplicate ? 'This payment was already settled.' : 'The consultation is now paid.');
      else toast.error('Payment declined (simulated)', 'You can try again with a new attempt.');
      onDone();
    },
    onError: (err) => toast.error('Simulation failed', describeError(err)),
  });
  return (
    <div className="mt-6 rounded-lg border border-dashed border-warning/40 bg-warning-soft/60 p-5">
      <p className="text-sm font-semibold text-warning">Simulated payment (no money moves)</p>
      <p className="mt-1 text-sm text-ink/80">
        The backend is running with its mock payment provider. Choose an outcome to continue the workflow exactly as a real provider callback would.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button onClick={() => confirm.mutate('succeeded')} loading={confirm.isPending && confirm.variables === 'succeeded'} disabled={confirm.isPending}>
          Simulate successful payment
        </Button>
        <Button variant="outline" onClick={() => confirm.mutate('failed')} loading={confirm.isPending && confirm.variables === 'failed'} disabled={confirm.isPending}>
          Simulate declined card
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted">Reference: {intent.providerPaymentId}</p>
    </div>
  );
}

function StripeCheckout({ intent, returnUrl, onConfirmed }: { intent: PaymentIntent; returnUrl: string; onConfirmed: () => void }) {
  const stripe = useMemo(() => getStripe(), []);
  if (!stripe) {
    return (
      <InlineAlert tone="warning" className="mt-6">
        The backend created a Stripe PaymentIntent, but <code>VITE_STRIPE_PUBLISHABLE_KEY</code> is not set in the frontend, so the card form cannot be shown. Add your
        <code> pk_test_…</code> key to <code>frontend/.env</code> and reload.
      </InlineAlert>
    );
  }
  if (!intent.clientSecret) {
    return (
      <InlineAlert tone="error" className="mt-6">
        The provider did not return a client secret. Please try again.
      </InlineAlert>
    );
  }
  return (
    <Elements
      stripe={stripe}
      options={{
        clientSecret: intent.clientSecret,
        appearance: {
          theme: 'stripe',
          variables: { colorPrimary: '#245C45', colorText: '#24342D', colorBackground: '#ffffff', borderRadius: '10px', fontFamily: 'DM Sans, system-ui, sans-serif' },
        },
      }}
    >
      <StripeForm returnUrl={returnUrl} onConfirmed={onConfirmed} />
    </Elements>
  );
}

function StripeForm({ returnUrl, onConfirmed }: { returnUrl: string; onConfirmed: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => setMessage(null), [stripe]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || submitting) return;
    setSubmitting(true);
    setMessage(null);
    // Stay on the page unless the payment method needs a redirect (e.g. 3-D Secure, wallets).
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
      redirect: 'if_required',
    });
    if (error) {
      // An intent that already succeeded (e.g. after a reload) is not an error for the customer.
      if (error.code === 'payment_intent_unexpected_state' && error.payment_intent?.status === 'succeeded') {
        onConfirmed();
      } else {
        setMessage(error.message ?? 'Payment could not be confirmed.');
      }
    } else if (paymentIntent?.status === 'succeeded' || paymentIntent?.status === 'processing') {
      // Tell the backend now instead of waiting for the webhook.
      onConfirmed();
    }
    setSubmitting(false);
  };

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />
      {message && <InlineAlert tone="error">{message}</InlineAlert>}
      <Button type="submit" size="lg" fullWidth loading={submitting} disabled={!stripe || !elements}>
        Pay securely
      </Button>
      <p className="text-xs text-muted">Test mode: use card 4242 4242 4242 4242 with any future date and CVC.</p>
    </form>
  );
}
