import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { AnalyticsService } from './analytics.service';
import { AnalyticsRangeDto, DoctorUtilizationQueryDto } from './dto/analytics.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/analytics')
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Booking, consultation, payment and slot aggregates for a date range' })
  overview(@Query() query: AnalyticsRangeDto) {
    return this.analytics.overview(query);
  }

  @Get('doctors')
  @ApiOperation({ summary: 'Per-doctor slot utilization and consultation outcomes' })
  doctors(@Query() query: DoctorUtilizationQueryDto) {
    return this.analytics.doctorUtilization(query);
  }
}
