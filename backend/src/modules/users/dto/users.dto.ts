import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender, Role, UserStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class UpdateProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 80) firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 80) lastName?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\+?[0-9]{8,15}$/) phone?: string;
  @ApiPropertyOptional({ example: '1990-05-21' }) @IsOptional() @IsDateString() dateOfBirth?: string;
  @ApiPropertyOptional({ enum: Gender }) @IsOptional() @IsEnum(Gender) gender?: Gender;
  @ApiPropertyOptional({ example: 'Asia/Kolkata' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  timezone?: string;
}

export class ChangeRoleDto {
  @ApiProperty({ enum: Role }) @IsEnum(Role) role: Role;
}

export class ChangeStatusDto {
  @ApiProperty({ enum: UserStatus }) @IsEnum(UserStatus) status: UserStatus;
}

export class ListUsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: Role }) @IsOptional() @IsEnum(Role) role?: Role;
  @ApiPropertyOptional({ enum: UserStatus }) @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
}
