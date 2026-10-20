import {
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaymentProvider as ProviderName, Role } from '@prisma/client';
import { Request } from 'express';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ReqContext, RequestContext } from '../../common/decorators/request-context.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreatePaymentIntentDto, MockConfirmDto } from './dto/payments.dto';
import { MockPaymentProvider } from './mock.provider';
import { PaymentProvider } from './payment-provider';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly provider: PaymentProvider,
  ) {}

  @Post('intents')
  @ApiBearerAuth()
  @Roles(Role.PATIENT)
  @ApiOperation({
    summary: 'Create or re-use a payment intent for a scheduled consultation (Stripe or mock)',
  })
  createIntent(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePaymentIntentDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.payments.createIntent(user, dto.consultationId, ctx);
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Payment status (owner or admin)' })
  getOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.payments.findOne(user, id);
  }

  @Post(':id/sync')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reconcile the payment with the provider (e.g. right after the customer confirmed on Stripe)',
  })
  sync(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.payments.syncFromProvider(user, id);
  }

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stripe webhook (signature verified, de-duplicated by event id)' })
  webhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature?: string) {
    return this.payments.handleWebhook(req.rawBody ?? Buffer.from(''), signature);
  }

  @Post(':id/mock-confirm')
  @ApiBearerAuth()
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'SIMULATION ONLY: settle a payment when the mock provider is active' })
  async mockConfirm(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MockConfirmDto,
  ) {
    if (this.provider.name !== ProviderName.MOCK || !(this.provider instanceof MockPaymentProvider)) {
      throw new NotFoundException('Mock confirmation is not available when a real provider is configured');
    }
    const payment = await this.payments.findOne(user, id); // ownership check
    if (!payment.providerPaymentId) {
      throw new ConflictException('Create a payment intent first (POST /payments/intents)');
    }
    return this.payments.applyProviderEvent(this.provider.buildEvent(payment.id, dto.outcome));
  }
}
