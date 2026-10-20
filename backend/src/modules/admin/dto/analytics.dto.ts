import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class AnalyticsRangeDto {
  @ApiPropertyOptional({ description: 'ISO 8601, defaults to 30 days ago' })
  @IsOptional()
  @IsDateString()
  from?: string;
  @ApiPropertyOptional({ description: 'ISO 8601, defaults to now' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class DoctorUtilizationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'ISO 8601, defaults to 30 days ago' })
  @IsOptional()
  @IsDateString()
  from?: string;
  @ApiPropertyOptional({ description: 'ISO 8601, defaults to now' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
