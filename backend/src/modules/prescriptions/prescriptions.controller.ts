import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { ReqContext, RequestContext } from '../../common/decorators/request-context.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreatePrescriptionDto } from './dto/prescriptions.dto';
import { PrescriptionsService } from './prescriptions.service';

@ApiTags('prescriptions')
@ApiBearerAuth()
@Controller('prescriptions')
export class PrescriptionsController {
  constructor(private readonly prescriptions: PrescriptionsService) {}

  @Post()
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Issue a prescription for an in-progress or completed consultation' })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePrescriptionDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.prescriptions.create(user, dto, ctx);
  }

  @Get()
  @ApiOperation({ summary: 'Prescriptions visible to the caller' })
  list(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto) {
    return this.prescriptions.listMine(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Prescription by id (patient owner, issuing doctor or admin)' })
  getOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.prescriptions.findOne(user, id);
  }
}
