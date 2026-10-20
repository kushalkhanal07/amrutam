import { Module } from '@nestjs/common';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor';
import { ConsultationsModule } from '../consultations/consultations.module';
import { PaymentsModule } from '../payments/payments.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

@Module({
  imports: [ConsultationsModule, PaymentsModule],
  controllers: [BookingsController],
  providers: [BookingsService, IdempotencyInterceptor],
  exports: [BookingsService],
})
export class BookingsModule {}
