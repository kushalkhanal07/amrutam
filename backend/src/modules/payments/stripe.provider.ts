import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PaymentProvider as ProviderName } from '@prisma/client';
import Stripe from 'stripe';
import { withRetry } from '../../common/utils/retry';
import { AppConfigService } from '../../config/app-config.service';
import {
  CreateIntentInput,
  CreateIntentResult,
  PaymentProvider,
  ProviderEvent,
  ProviderIntentState,
  ProviderIntentStatus,
} from './payment-provider';

/** Transient Stripe failures that are safe to retry (the request carries an idempotency key). */
function isTransient(err: unknown): boolean {
  return (
    err instanceof Stripe.errors.StripeConnectionError ||
    err instanceof Stripe.errors.StripeAPIError ||
    err instanceof Stripe.errors.StripeRateLimitError
  );
}

function normaliseStatus(status: Stripe.PaymentIntent.Status): ProviderIntentStatus {
  switch (status) {
    case 'succeeded':
      return 'succeeded';
    case 'processing':
      return 'processing';
    case 'requires_action':
    case 'requires_capture':
      return 'requires_action';
    case 'canceled':
      return 'canceled';
    default:
      // requires_payment_method, requires_confirmation: the customer can still pay.
      return 'open';
  }
}

@Injectable()
export class StripePaymentProvider extends PaymentProvider {
  readonly name = ProviderName.STRIPE;
  private readonly logger = new Logger(StripePaymentProvider.name);
  private readonly stripe: Stripe;
  private readonly webhookSecret?: string;

  constructor(config: AppConfigService) {
    super();
    const key = config.get('STRIPE_SECRET_KEY');
    if (!key) {
      throw new Error('StripePaymentProvider requires STRIPE_SECRET_KEY');
    }
    this.stripe = new Stripe(key, {
      timeout: config.get('STRIPE_TIMEOUT_MS'),
      maxNetworkRetries: 0, // we control retries ourselves
      appInfo: { name: 'amrutam-backend' },
    });
    this.webhookSecret = config.get('STRIPE_WEBHOOK_SECRET');
  }

  async createIntent(input: CreateIntentInput): Promise<CreateIntentResult> {
    // A new key after a cancelled intent, otherwise Stripe would return the cancelled one.
    const idempotencyKey = `pi_${input.paymentId}_${input.previousProviderPaymentId ?? 'first'}`;
    try {
      const intent = await withRetry(
        () =>
          this.stripe.paymentIntents.create(
            {
              amount: input.amountMinor,
              currency: input.currency.toLowerCase(),
              metadata: input.metadata,
              automatic_payment_methods: { enabled: true },
            },
            { idempotencyKey },
          ),
        {
          attempts: 3,
          shouldRetry: isTransient,
          onRetry: (err, attempt) => this.logger.warn({ attempt }, 'Retrying Stripe createIntent'),
        },
      );
      return { providerPaymentId: intent.id, clientSecret: intent.client_secret };
    } catch (err) {
      this.logger.error({ err: (err as Error).message }, 'Stripe createIntent failed');
      throw new ServiceUnavailableException('Payment provider is unavailable');
    }
  }

  async retrieveIntent(providerPaymentId: string): Promise<ProviderIntentState> {
    try {
      const intent = await withRetry(() => this.stripe.paymentIntents.retrieve(providerPaymentId), {
        attempts: 3,
        shouldRetry: isTransient,
      });
      return {
        providerPaymentId: intent.id,
        clientSecret: intent.client_secret,
        status: normaliseStatus(intent.status),
        failureReason: intent.last_payment_error?.message ?? undefined,
      };
    } catch (err) {
      this.logger.error({ err: (err as Error).message, providerPaymentId }, 'Stripe retrieveIntent failed');
      throw new ServiceUnavailableException('Payment provider is unavailable');
    }
  }

  async cancelIntent(providerPaymentId: string): Promise<void> {
    try {
      await this.stripe.paymentIntents.cancel(providerPaymentId);
    } catch (err) {
      // Already cancelled/succeeded intents raise an invalid request error; that is fine here.
      if (!(err instanceof Stripe.errors.StripeInvalidRequestError)) {
        throw err;
      }
    }
  }

  async refund(providerPaymentId: string, idempotencyKey: string): Promise<{ refundId: string }> {
    const refund = await withRetry(
      () => this.stripe.refunds.create({ payment_intent: providerPaymentId }, { idempotencyKey }),
      { attempts: 3, shouldRetry: isTransient },
    );
    return { refundId: refund.id };
  }

  parseWebhook(rawBody: Buffer, signature: string | undefined): ProviderEvent {
    if (!this.webhookSecret) {
      throw new ServiceUnavailableException('STRIPE_WEBHOOK_SECRET is not configured');
    }
    if (!signature) {
      throw new BadRequestException('Missing Stripe-Signature header');
    }
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch {
      throw new BadRequestException('Invalid Stripe webhook signature');
    }

    const base = { id: event.id, rawType: event.type, payload: event.data.object };
    switch (event.type) {
      case 'payment_intent.succeeded':
        return { ...base, type: 'succeeded', providerPaymentId: event.data.object.id };
      case 'payment_intent.payment_failed':
        return {
          ...base,
          type: 'failed',
          providerPaymentId: event.data.object.id,
          failureReason: event.data.object.last_payment_error?.message ?? 'payment_failed',
        };
      case 'payment_intent.canceled':
        return {
          ...base,
          type: 'failed',
          providerPaymentId: event.data.object.id,
          failureReason: 'canceled',
        };
      case 'charge.refunded': {
        const charge = event.data.object;
        const pi =
          typeof charge.payment_intent === 'string'
            ? charge.payment_intent
            : (charge.payment_intent?.id ?? null);
        return { ...base, type: 'refunded', providerPaymentId: pi, refundId: charge.refunds?.data[0]?.id };
      }
      default:
        return { ...base, type: 'ignored', providerPaymentId: null };
    }
  }
}
