import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReqContext, RequestContext } from '../../common/decorators/request-context.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Idempotent } from '../../common/idempotency/idempotent.decorator';
import { ConsultationsService } from '../consultations/consultations.service';
import { BookingsService } from './bookings.service';
import { CancelBookingDto, CreateBookingDto } from './dto/bookings.dto';

@ApiTags('bookings')
@ApiBearerAuth()
@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly consultations: ConsultationsService,
  ) {}

  @Post()
  @Roles(Role.PATIENT)
  @Idempotent()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Book an available slot. Requires an Idempotency-Key header.' })
  @ApiResponse({ status: 201, description: 'Consultation created (status SCHEDULED, payment PENDING)' })
  @ApiResponse({ status: 409, description: 'Slot already booked, or idempotent request still in progress' })
  @ApiResponse({ status: 422, description: 'Idempotency-Key reused with a different payload' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBookingDto, @ReqContext() ctx: RequestContext) {
    return this.bookings.create(user, dto, ctx);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Booking details (alias of GET /consultations/:id)' })
  getOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.consultations.findOneForUser(user, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Cancel a scheduled booking (patient, doctor or admin). Releases the slot and refunds/voids payment.',
  })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelBookingDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.bookings.cancel(user, id, dto, ctx);
  }
}
