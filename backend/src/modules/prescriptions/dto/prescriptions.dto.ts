import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class PrescriptionItemDto {
  @ApiProperty({ example: 'Ashwagandha capsules' }) @IsString() @Length(1, 200) medicationName: string;
  @ApiProperty({ example: '500mg' }) @IsString() @Length(1, 100) dosage: string;
  @ApiProperty({ example: 'Twice daily after meals' }) @IsString() @Length(1, 200) frequency: string;
  @ApiProperty({ example: 30 }) @IsInt() @Min(1) @Max(365) durationDays: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class CreatePrescriptionDto {
  @ApiProperty() @IsUUID() consultationId: string;
  @ApiProperty({ example: 'Mild vata imbalance' }) @IsString() @Length(1, 1000) diagnosis: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(3000) instructions?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() validUntil?: string;
  @ApiProperty({ type: [PrescriptionItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items: PrescriptionItemDto[];
}
