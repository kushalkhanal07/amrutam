import { PaymentProvider as ProviderName } from '@prisma/client';

export interface CreateIntentInput {
  /** Our payment id; combined with the previous intent id it forms the provider idempotency key. */
  paymentId: string;
  /** The previous provider intent for this payment (if any); a new key is used after it was cancelled. */
  previousProviderPaymentId: string | null;
  amountMinor: number;
  currency: string;
  metadata: Record<string, string>;
}

export interface CreateIntentResult {
  providerPaymentId: string;
  /** Secret the frontend uses to confirm the payment with the provider SDK. Returned, never stored. */
  clientSecret: string | null;
}

/** Normalised view of a provider-side intent, used to reconcile without webhooks. */
export type ProviderIntentStatus = 'succeeded' | 'processing' | 'requires_action' | 'open' | 'canceled';

export interface ProviderIntentState {
  providerPaymentId: string;
  clientSecret: string | null;
  status: ProviderIntentStatus;
  failureReason?: string;
}

export type ProviderEventType = 'succeeded' | 'failed' | 'refunded' | 'ignored';

export interface ProviderEvent {
  /** Provider-side unique event id (Stripe `evt_...`). Used for webhook de-duplication. */
  id: string;
  type: ProviderEventType;
  rawType: string;
  providerPaymentId: string | null;
  failureReason?: string;
  refundId?: string;
  payload: unknown;
}

/**
 * Integration boundary for payment providers. The application only talks to
 * this abstraction; StripePaymentProvider and MockPaymentProvider implement it.
 * Card numbers / CVVs never reach this backend: the frontend confirms the
 * PaymentIntent directly with the provider using the clientSecret.
 */
export abstract class PaymentProvider {
  abstract readonly name: ProviderName;
  abstract createIntent(input: CreateIntentInput): Promise<CreateIntentResult>;
  /** Reads the current state of an intent from the provider (source of truth). */
  abstract retrieveIntent(providerPaymentId: string): Promise<ProviderIntentState>;
  abstract cancelIntent(providerPaymentId: string): Promise<void>;
  abstract refund(providerPaymentId: string, idempotencyKey: string): Promise<{ refundId: string }>;
  /** Verifies the webhook signature and normalises the event. Throws on invalid signature. */
  abstract parseWebhook(rawBody: Buffer, signature: string | undefined): ProviderEvent;
}
