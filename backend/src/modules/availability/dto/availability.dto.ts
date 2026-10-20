import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class SlotInputDto {
  @ApiProperty({ example: '2026-11-01T09:00:00.000Z' }) @IsDateString() startsAt: string;
  @ApiProperty({ example: '2026-11-01T09:30:00.000Z' }) @IsDateString() endsAt: string;
}

export class CreateSlotsDto {
  @ApiProperty({ type: [SlotInputDto], description: 'Up to 100 slots per request' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SlotInputDto)
  slots: SlotInputDto[];
}

export class GenerateSlotsDto {
  @ApiProperty({ example: '2026-11-01T09:00:00.000Z' }) @IsDateString() from: string;
  @ApiProperty({ example: '2026-11-01T13:00:00.000Z' }) @IsDateString() to: string;
  @ApiProperty({ example: 30, description: 'Slot length in minutes' })
  @IsInt()
  @Min(5)
  @Max(240)
  durationMinutes: number;
}

export class SlotRangeQueryDto {
  @ApiPropertyOptional({ description: 'ISO 8601, defaults to now' })
  @IsOptional()
  @IsDateString()
  from?: string;
  @ApiPropertyOptional({ description: 'ISO 8601, defaults to from + 14 days' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
