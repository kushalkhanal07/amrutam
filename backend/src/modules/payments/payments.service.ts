import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PaymentStatus, Prisma, Role } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { RequestContext } from '../../common/decorators/request-context.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditAction, AuditService } from '../audit-logs/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentProvider, ProviderEvent, ProviderIntentState } from './payment-provider';

export const paymentSelect = {
  id: true,
  consultationId: true,
  patientId: true,
  amountMinor: true,
  currency: true,
  status: true,
  provider: true,
  providerPaymentId: true,
  failureReason: true,
  paidAt: true,
  refundedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PaymentSelect;

/** Payment lifecycle: PENDING -> PROCESSING -> SUCCEEDED -> REFUNDED, or -> FAILED. */
const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  PENDING: [PaymentStatus.PROCESSING, PaymentStatus.SUCCEEDED, PaymentStatus.FAILED],
  PROCESSING: [PaymentStatus.SUCCEEDED, PaymentStatus.FAILED],
  SUCCEEDED: [PaymentStatus.REFUNDED],
  // A declined card can be retried; a "failed" record can also turn out to have succeeded
  // at the provider (late webhook, cancelled booking) and money must never be lost track of.
  FAILED: [PaymentStatus.PROCESSING, PaymentStatus.SUCCEEDED],
  REFUNDED: [],
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: PaymentProvider,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  get providerName() {
    return this.provider.name;
  }

  async findOne(user: AuthUser, id: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id }, select: paymentSelect });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    if (user.role !== Role.ADMIN && payment.patientId !== user.id) {
      throw new ForbiddenException('You do not have access to this payment');
    }
    return payment;
  }

  /**
   * Creates (or re-uses) a provider PaymentIntent for the consultation's payment.
   *
   * - PENDING, or FAILED with no reusable intent: create a new intent.
   * - PROCESSING / FAILED with an existing intent: ask the provider for its real
   *   state first. Already succeeded -> record it and refuse (nothing to pay);
   *   cancelled -> create a fresh intent; otherwise hand back the same intent so
   *   the customer can finish or retry it.
   */
  async createIntent(user: AuthUser, consultationId: string, ctx: RequestContext) {
    const payment = await this.prisma.payment.findUnique({
      where: { consultationId },
      include: { consultation: { select: { status: true } } },
    });
    if (!payment) {
      throw new NotFoundException('No payment record for this consultation');
    }
    if (payment.patientId !== user.id) {
      throw new ForbiddenException('You can only pay for your own consultations');
    }
    if (payment.consultation.status !== 'SCHEDULED') {
      throw new ConflictException('Payment is only possible for scheduled consultations');
    }
    if (payment.status === PaymentStatus.SUCCEEDED || payment.status === PaymentStatus.REFUNDED) {
      throw new ConflictException(`Payment is already ${payment.status.toLowerCase()}`);
    }

    let intent: { providerPaymentId: string; clientSecret: string | null };
    if (payment.providerPaymentId) {
      const remote = await this.provider.retrieveIntent(payment.providerPaymentId);
      if (remote.status === 'succeeded') {
        await this.applyRemoteState(payment.providerPaymentId, remote);
        throw new ConflictException('Payment has already succeeded');
      }
      intent =
        remote.status === 'canceled'
          ? await this.provider.createIntent(this.intentInput(payment, consultationId))
          : { providerPaymentId: remote.providerPaymentId, clientSecret: remote.clientSecret };
    } else {
      intent = await this.provider.createIntent(this.intentInput(payment, consultationId));
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          providerPaymentId: intent.providerPaymentId,
          status: PaymentStatus.PROCESSING,
          failureReason: null,
        },
      });
      await this.audit.record(
        {
          action: AuditAction.PAYMENT_INTENT_CREATED,
          entityType: 'Payment',
          entityId: payment.id,
          actorId: user.id,
          actorRole: user.role,
          metadata: {
            provider: this.provider.name,
            amountMinor: payment.amountMinor,
            currency: payment.currency,
            reused: intent.providerPaymentId === payment.providerPaymentId,
          },
          context: ctx,
        },
        tx,
      );
    });

    return {
      paymentId: payment.id,
      provider: this.provider.name,
      providerPaymentId: intent.providerPaymentId,
      clientSecret: intent.clientSecret,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
    };
  }

  private intentInput(
    payment: { id: string; providerPaymentId: string | null; amountMinor: number; currency: string },
    consultationId: string,
  ) {
    return {
      paymentId: payment.id,
      previousProviderPaymentId: payment.providerPaymentId,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      metadata: { paymentId: payment.id, consultationId },
    };
  }

  /**
   * Reconciles our record with the provider's current state. Lets a client
   * that just confirmed a payment (or returned from a redirect) see the result
   * immediately, and keeps local development working without webhooks.
   */
  async syncFromProvider(user: AuthUser, paymentId: string) {
    const payment = await this.findOne(user, paymentId);
    if (!payment.providerPaymentId) {
      throw new ConflictException('Create a payment intent first (POST /payments/intents)');
    }
    if (payment.status === PaymentStatus.PROCESSING || payment.status === PaymentStatus.FAILED) {
      const remote = await this.provider.retrieveIntent(payment.providerPaymentId);
      await this.applyRemoteState(payment.providerPaymentId, remote);
      // Money arrived for a consultation that is no longer going ahead: refund it.
      const consultation = await this.prisma.consultation.findUnique({
        where: { id: payment.consultationId },
        select: { status: true },
      });
      if (consultation?.status === 'CANCELLED') {
        await this.onConsultationCancelled(payment.consultationId);
      }
    }
    return this.findOne(user, paymentId);
  }

  private async applyRemoteState(providerPaymentId: string, remote: ProviderIntentState): Promise<void> {
    if (remote.status === 'succeeded') {
      await this.applyProviderEvent({
        id: `sync_${providerPaymentId}_succeeded`,
        type: 'succeeded',
        rawType: 'provider.sync.succeeded',
        providerPaymentId,
        payload: { source: 'sync' },
      });
    } else if (remote.status === 'canceled') {
      await this.applyProviderEvent({
        id: `sync_${providerPaymentId}_canceled`,
        type: 'failed',
        rawType: 'provider.sync.canceled',
        providerPaymentId,
        failureReason: remote.failureReason ?? 'canceled',
        payload: { source: 'sync' },
      });
    }
  }

  /** Stripe (or any provider) webhook entry point. */
  async handleWebhook(rawBody: Buffer, signature: string | undefined) {
    const event = this.provider.parseWebhook(rawBody, signature);
    return this.applyProviderEvent(event);
  }

  /**
   * Applies a provider event exactly once. The PaymentEvent row is inserted in
   * the same transaction as the status change; its unique provider event id
   * makes a redelivered webhook a harmless no-op.
   */
  async applyProviderEvent(
    event: ProviderEvent,
  ): Promise<{ received: true; duplicate: boolean; applied: boolean }> {
    if (event.type === 'ignored' || !event.providerPaymentId) {
      return { received: true, duplicate: false, applied: false };
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const payment = await tx.payment.findUnique({
          where: { providerPaymentId: event.providerPaymentId! },
        });
        await tx.paymentEvent.create({
          data: {
            paymentId: payment?.id,
            providerEventId: event.id,
            type: event.rawType,
            payload: event.payload as Prisma.InputJsonValue,
          },
        });
        if (!payment) {
          this.logger.warn({ providerPaymentId: event.providerPaymentId }, 'Webhook for unknown payment');
          return { received: true as const, duplicate: false, applied: false };
        }

        const target =
          event.type === 'succeeded'
            ? PaymentStatus.SUCCEEDED
            : event.type === 'refunded'
              ? PaymentStatus.REFUNDED
              : PaymentStatus.FAILED;
        if (!PAYMENT_TRANSITIONS[payment.status].includes(target)) {
          // e.g. a late "failed" after "succeeded": record the event, do not regress the status.
          return { received: true as const, duplicate: false, applied: false };
        }

        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: target,
            paidAt: target === PaymentStatus.SUCCEEDED ? new Date() : undefined,
            refundedAt: target === PaymentStatus.REFUNDED ? new Date() : undefined,
            providerRefundId: event.refundId,
            failureReason: target === PaymentStatus.FAILED ? (event.failureReason ?? 'failed') : null,
          },
        });
        await this.audit.record(
          {
            action: AuditAction.PAYMENT_STATUS_CHANGED,
            entityType: 'Payment',
            entityId: payment.id,
            actorRole: null,
            metadata: { from: payment.status, to: target, eventId: event.id },
          },
          tx,
        );
        if (target === PaymentStatus.SUCCEEDED || target === PaymentStatus.FAILED) {
          await this.notifications.enqueue(
            {
              type: target === PaymentStatus.SUCCEEDED ? 'payment.succeeded' : 'payment.failed',
              recipientId: payment.patientId,
              payload: { paymentId: payment.id, consultationId: payment.consultationId },
            },
            tx,
          );
        }
        return { received: true as const, duplicate: false, applied: true };
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return { received: true, duplicate: true, applied: false };
      }
      throw err;
    }
  }

  /**
   * Called after a consultation is cancelled. Refunds a successful payment or
   * voids an open intent. Runs outside the cancellation transaction because it
   * talks to an external system; failures are logged for manual follow-up.
   */
  async onConsultationCancelled(consultationId: string): Promise<void> {
    let payment = await this.prisma.payment.findUnique({ where: { consultationId } });
    if (!payment) return;
    try {
      if (payment.status === PaymentStatus.PROCESSING && payment.providerPaymentId) {
        // The customer may have paid moments ago without the webhook having arrived yet.
        const remote = await this.provider.retrieveIntent(payment.providerPaymentId);
        await this.applyRemoteState(payment.providerPaymentId, remote);
        payment = (await this.prisma.payment.findUnique({ where: { consultationId } })) ?? payment;
      }
      if (payment.status === PaymentStatus.SUCCEEDED && payment.providerPaymentId) {
        const { refundId } = await this.provider.refund(payment.providerPaymentId, `refund_${payment.id}`);
        await this.applyProviderEvent({
          id: `refund_${payment.id}`,
          type: 'refunded',
          rawType: 'internal.refund_on_cancel',
          providerPaymentId: payment.providerPaymentId,
          refundId,
          payload: { reason: 'consultation_cancelled' },
        });
      } else if (payment.status === PaymentStatus.PENDING || payment.status === PaymentStatus.PROCESSING) {
        if (payment.providerPaymentId) {
          await this.provider.cancelIntent(payment.providerPaymentId);
        }
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.FAILED, failureReason: 'consultation_cancelled' },
        });
      }
    } catch (err) {
      this.logger.error(
        { err, paymentId: payment.id },
        'Refund/void after cancellation failed; needs manual follow-up',
      );
    }
  }
}
