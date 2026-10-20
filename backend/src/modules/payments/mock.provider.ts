import { Injectable, NotFoundException } from '@nestjs/common';
import { PaymentProvider as ProviderName } from '@prisma/client';
import {
  CreateIntentInput,
  CreateIntentResult,
  PaymentProvider,
  ProviderEvent,
  ProviderIntentState,
} from './payment-provider';

/**
 * MOCK provider used when STRIPE_SECRET_KEY is not configured.
 * No money moves. Payment outcomes are simulated through
 * POST /payments/:id/mock-confirm, which is only mounted while this provider is active.
 */
@Injectable()
export class MockPaymentProvider extends PaymentProvider {
  readonly name = ProviderName.MOCK;

  async createIntent(input: CreateIntentInput): Promise<CreateIntentResult> {
    await Promise.resolve();
    // Deterministic id: re-requesting an intent for the same payment returns the same reference.
    return {
      providerPaymentId: `mock_pi_${input.paymentId}`,
      clientSecret: `mock_secret_${input.paymentId}`,
    };
  }

  async retrieveIntent(providerPaymentId: string): Promise<ProviderIntentState> {
    await Promise.resolve();
    // The mock has no remote state; the database is the source of truth, so the intent is always "open".
    return {
      providerPaymentId,
      clientSecret: providerPaymentId.replace('mock_pi_', 'mock_secret_'),
      status: 'open',
    };
  }

  async cancelIntent(): Promise<void> {
    await Promise.resolve();
  }

  async refund(providerPaymentId: string): Promise<{ refundId: string }> {
    await Promise.resolve();
    return { refundId: `mock_re_${providerPaymentId}` };
  }

  parseWebhook(): ProviderEvent {
    throw new NotFoundException('Webhooks are not available with the mock payment provider');
  }

  /** Builds the event the mock-confirm endpoint feeds into the normal event pipeline. */
  buildEvent(paymentId: string, outcome: 'succeeded' | 'failed'): ProviderEvent {
    return {
      id: `mock_evt_${paymentId}_${outcome}`,
      type: outcome,
      rawType: `mock.payment_intent.${outcome}`,
      providerPaymentId: `mock_pi_${paymentId}`,
      failureReason: outcome === 'failed' ? 'mock_declined' : undefined,
      payload: { simulated: true },
    };
  }
}
