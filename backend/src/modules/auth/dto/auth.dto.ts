import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'patient@example.com' })
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'Str0ng!Passw0rd', minLength: 10 })
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password: string;

  @ApiProperty({ example: 'Asha' })
  @IsString()
  @Length(1, 80)
  firstName: string;

  @ApiProperty({ example: 'Verma' })
  @IsString()
  @Length(1, 80)
  lastName: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  @IsOptional()
  @Matches(/^\+?[0-9]{8,15}$/, { message: 'phone must be 8-15 digits with optional leading +' })
  phone?: string;

  @ApiPropertyOptional({
    enum: [Role.PATIENT, Role.DOCTOR],
    default: Role.PATIENT,
    description: 'Admins cannot self-register.',
  })
  @IsOptional()
  @IsEnum([Role.PATIENT, Role.DOCTOR])
  role?: typeof Role.PATIENT | typeof Role.DOCTOR;
}

export class LoginDto {
  @ApiProperty({ example: 'patient@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Str0ng!Passw0rd' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  @MinLength(20)
  @MaxLength(512)
  refreshToken: string;
}

export class MfaVerifyDto {
  @ApiProperty({ description: 'Token returned by /auth/login when MFA is required' })
  @IsString()
  mfaToken: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^[0-9]{6}$/)
  code: string;
}

export class MfaCodeDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^[0-9]{6}$/)
  code: string;
}

export class TokenPairResponse {
  @ApiProperty() accessToken: string;
  @ApiProperty() refreshToken: string;
  @ApiProperty({ description: 'Seconds until the access token expires' }) accessTokenExpiresIn: number;
  @ApiProperty({ enum: Role }) role: Role;
}

export class MfaRequiredResponse {
  @ApiProperty({ example: true }) mfaRequired: true;
  @ApiProperty() mfaToken: string;
}
