import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ReqContext, RequestContext } from '../../common/decorators/request-context.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AvailabilityService } from '../availability/availability.service';
import { SlotRangeQueryDto } from '../availability/dto/availability.dto';
import { DoctorsService } from './doctors.service';
import {
  SearchDoctorsQueryDto,
  UpdateDoctorProfileDto,
  UpsertDoctorProfileDto,
  VerifyDoctorDto,
} from './dto/doctors.dto';

@ApiTags('doctors')
@Controller('doctors')
export class DoctorsController {
  constructor(
    private readonly doctors: DoctorsService,
    private readonly availability: AvailabilityService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Search verified doctors with filters, sorting and pagination' })
  search(@Query() query: SearchDoctorsQueryDto) {
    return this.doctors.search(query);
  }

  @Get('me')
  @ApiBearerAuth()
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Own doctor profile' })
  me(@CurrentUser() user: AuthUser) {
    return this.doctors.findByUserId(user.id);
  }

  @Post('me')
  @ApiBearerAuth()
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Create own doctor profile (starts as PENDING verification)' })
  createMe(@CurrentUser() user: AuthUser, @Body() dto: UpsertDoctorProfileDto) {
    return this.doctors.createProfile(user.id, dto);
  }

  @Patch('me')
  @ApiBearerAuth()
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Update own doctor profile' })
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateDoctorProfileDto) {
    return this.doctors.updateProfile(user.id, dto);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Public doctor profile' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.doctors.findPublic(id);
  }

  @Public()
  @Get(':id/availability')
  @ApiOperation({ summary: 'Available (unbooked, future) slots for a doctor' })
  availabilityFor(@Param('id', ParseUUIDPipe) id: string, @Query() query: SlotRangeQueryDto) {
    return this.availability.listAvailableForDoctor(id, query);
  }

  @Patch(':id/verification')
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Verify or reject a doctor (admin, audited)' })
  verify(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyDoctorDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.doctors.setVerification(actor.id, id, dto.status, ctx);
  }
}
