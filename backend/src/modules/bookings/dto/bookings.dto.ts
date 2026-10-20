import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConsultationMode } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateBookingDto {
  @ApiProperty() @IsUUID() doctorId: string;
  @ApiProperty() @IsUUID() slotId: string;
  @ApiPropertyOptional({ enum: ConsultationMode, default: ConsultationMode.VIDEO })
  @IsOptional()
  @IsEnum(ConsultationMode)
  mode?: ConsultationMode;
  @ApiPropertyOptional({ description: 'Short reason shown to the doctor' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reasonForVisit?: string;
}

export class CancelBookingDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
