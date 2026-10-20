import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DoctorVerificationStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class UpsertDoctorProfileDto {
  @ApiProperty({ example: 'Ayurveda' }) @IsString() @Length(2, 80) specialization: string;
  @ApiPropertyOptional({ example: ['BAMS', 'MD'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  qualifications?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) bio?: string;
  @ApiPropertyOptional({ example: 8 }) @IsOptional() @IsInt() @Min(0) @Max(70) yearsOfExperience?: number;
  @ApiPropertyOptional({ example: ['en', 'hi'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  languages?: string[];
  @ApiProperty({ example: 50000, description: 'Fee in minor units (e.g. paise). 50000 = INR 500.00' })
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  consultationFeeMinor: number;
  @ApiPropertyOptional({ example: 'INR', default: 'INR' })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
}

export class UpdateDoctorProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 80) specialization?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  qualifications?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) bio?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(70) yearsOfExperience?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  languages?: string[];
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100_000_000) consultationFeeMinor?: number;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
}

export class VerifyDoctorDto {
  @ApiProperty({ enum: DoctorVerificationStatus })
  @IsEnum(DoctorVerificationStatus)
  status: DoctorVerificationStatus;
}

export const DOCTOR_SORT_FIELDS = ['fee', 'experience', 'rating', 'createdAt'] as const;

export class SearchDoctorsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'Ayurveda', description: 'Case-insensitive match on specialization' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  specialization?: string;

  @ApiPropertyOptional({ description: 'Free text over name and bio' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional({ example: 'hi' }) @IsOptional() @IsString() @MaxLength(10) language?: string;

  @ApiPropertyOptional({ description: 'Max fee in minor units' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxFeeMinor?: number;

  @ApiPropertyOptional({ description: 'Minimum years of experience' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minExperience?: number;

  @ApiPropertyOptional({
    description:
      'Only doctors with an AVAILABLE slot starting after this time (ISO 8601). Defaults to now when availableOnly=true.',
  })
  @IsOptional()
  @IsDateString()
  availableFrom?: string;

  @ApiPropertyOptional({ description: 'Only doctors with an AVAILABLE slot before this time (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  availableTo?: string;

  @ApiPropertyOptional({ default: false, description: 'Only doctors with at least one open future slot' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  availableOnly?: boolean;

  @ApiPropertyOptional({ enum: DOCTOR_SORT_FIELDS, default: 'rating' })
  @IsOptional()
  @IsIn(DOCTOR_SORT_FIELDS)
  sortBy: (typeof DOCTOR_SORT_FIELDS)[number] = 'rating';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir: 'asc' | 'desc' = 'desc';
}
