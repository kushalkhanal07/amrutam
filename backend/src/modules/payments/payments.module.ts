import { Logger, Module } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { MockPaymentProvider } from './mock.provider';
import { PaymentProvider } from './payment-provider';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { StripePaymentProvider } from './stripe.provider';

@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    {
      provide: PaymentProvider,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): PaymentProvider => {
        if (config.stripeConfigured) {
          const logger = new Logger('PaymentsModule');
          logger.log('Using Stripe payment provider');
          if (!config.get('STRIPE_SECRET_KEY')?.startsWith('sk_')) {
            logger.warn(
              'STRIPE_SECRET_KEY does not look like a secret key (expected "sk_test_..." or "sk_live_...")',
            );
          }
          const webhookSecret = config.get('STRIPE_WEBHOOK_SECRET');
          if (!webhookSecret) {
            logger.warn('STRIPE_WEBHOOK_SECRET is not set: /payments/webhook will reject every event');
          } else if (!webhookSecret.startsWith('whsec_')) {
            logger.warn(
              'STRIPE_WEBHOOK_SECRET does not look like a webhook signing secret (expected "whsec_..."; a "pk_" publishable key will not work)',
            );
          }
          return new StripePaymentProvider(config);
        }
        new Logger('PaymentsModule').warn(
          'STRIPE_SECRET_KEY not set: using MOCK payment provider (no real payments)',
        );
        return new MockPaymentProvider();
      },
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
