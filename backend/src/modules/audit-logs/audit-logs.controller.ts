import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLogsService } from './audit-logs.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/audit-logs')
@Roles(Role.ADMIN)
export class AuditLogsController {
  constructor(private readonly auditLogs: AuditLogsService) {}

  @Get()
  @ApiOperation({ summary: 'List audit events (admin only)' })
  list(@Query() query: AuditLogQueryDto) {
    return this.auditLogs.list(query);
  }
}
