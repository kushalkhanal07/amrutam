import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReqContext, RequestContext } from '../../common/decorators/request-context.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PrescriptionsService } from '../prescriptions/prescriptions.service';
import { ConsultationsService } from './consultations.service';
import { CompleteConsultationDto, ListConsultationsQueryDto } from './dto/consultations.dto';

@ApiTags('consultations')
@ApiBearerAuth()
@Controller('consultations')
export class ConsultationsController {
  constructor(
    private readonly consultations: ConsultationsService,
    private readonly prescriptions: PrescriptionsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List consultations visible to the caller' })
  list(@CurrentUser() user: AuthUser, @Query() query: ListConsultationsQueryDto) {
    return this.consultations.list(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultation details (owner or admin)' })
  getOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.consultations.findOneForUser(user, id);
  }

  @Get(':id/prescription')
  @ApiOperation({ summary: 'Prescription for a consultation (owner or admin)' })
  prescription(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.prescriptions.findByConsultation(user, id);
  }

  @Get(':id/session')
  @ApiOperation({ summary: 'Join details (link, mode) for a consultation that is in progress' })
  session(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.consultations.session(user, id);
  }

  @Post(':id/start')
  @Roles(Role.DOCTOR)
  @ApiOperation({
    summary: 'SCHEDULED -> IN_PROGRESS. Creates a session and emails the patient the join link.',
  })
  start(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.consultations.start(user, id, ctx);
  }

  @Post(':id/complete')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'IN_PROGRESS -> COMPLETED' })
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteConsultationDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.consultations.complete(user, id, dto, ctx);
  }

  @Post(':id/no-show')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'SCHEDULED -> NO_SHOW (after the scheduled start time)' })
  noShow(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.consultations.markNoShow(user, id, ctx);
  }
}
