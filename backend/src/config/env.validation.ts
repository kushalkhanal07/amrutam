import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

const toBool = ({ value }: { value: unknown }) => value === true || value === 'true' || value === '1';
const toInt = ({ value }: { value: unknown }) =>
  value === '' || value === undefined ? undefined : Number(value);

/**
 * Every environment variable the app reads is declared here and validated once
 * at startup. A missing or malformed value stops the process with a clear
 * message instead of failing later at runtime.
 */
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  PORT = 3000;

  @IsString()
  @MinLength(1)
  CORS_ORIGIN = 'http://localhost:5173';

  /** Public URL of the frontend. Used to build links placed in emails (e.g. the consultation join link). */
  @IsString()
  @Matches(/^https?:\/\//, { message: 'APP_URL must start with http:// or https://' })
  APP_URL = 'http://localhost:5173';

  @IsString()
  LOG_LEVEL = 'info';

  /** Swagger UI at /docs. Defaults to on outside production and off in production; set explicitly to override. */
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : toBool({ value })))
  @IsBoolean()
  SWAGGER_ENABLED?: boolean;

  @IsString()
  @Matches(/^postgres(ql)?:\/\//, { message: 'DATABASE_URL must be a postgresql:// connection string' })
  DATABASE_URL: string;

  @IsString()
  @MinLength(32, { message: 'JWT_ACCESS_SECRET must be at least 32 characters' })
  JWT_ACCESS_SECRET: string;

  @IsString()
  JWT_ACCESS_TTL = '15m';

  @Transform(toInt)
  @IsInt()
  @Min(1)
  REFRESH_TOKEN_TTL_DAYS = 30;

  @IsString()
  @Matches(/^[0-9a-fA-F]{64}$/, { message: 'MFA_ENCRYPTION_KEY must be 64 hex characters (32 bytes)' })
  MFA_ENCRYPTION_KEY: string;

  @IsString()
  MFA_ISSUER = 'Amrutam';

  @Transform(toInt)
  @IsInt()
  @Min(1)
  RATE_LIMIT_TTL_SECONDS = 60;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  RATE_LIMIT_MAX = 120;

  /** Disables rate limiting entirely. Only for automated tests. */
  @Transform(toBool)
  @IsBoolean()
  RATE_LIMIT_DISABLED = false;

  @IsOptional()
  @IsString()
  STRIPE_SECRET_KEY?: string;

  @IsOptional()
  @IsString()
  STRIPE_WEBHOOK_SECRET?: string;

  @Transform(toInt)
  @IsInt()
  @Min(1000)
  STRIPE_TIMEOUT_MS = 10000;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  IDEMPOTENCY_TTL_HOURS = 24;

  @Transform(toBool)
  @IsBoolean()
  NOTIFICATION_WORKER_ENABLED = true;

  // ---- Outbound email (SMTP). Leave SMTP_HOST empty to log emails instead of sending them. ----
  @IsOptional()
  @IsString()
  SMTP_HOST?: string;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  SMTP_PORT = 587;

  @Transform(toBool)
  @IsBoolean()
  SMTP_SECURE = false;

  @IsOptional()
  @IsString()
  SMTP_USER?: string;

  @IsOptional()
  @IsString()
  SMTP_PASS?: string;

  @IsString()
  MAIL_FROM = 'Amrutam Care <no-reply@amrutam.local>';

  @Transform(toInt)
  @IsInt()
  @Min(100)
  NOTIFICATION_POLL_INTERVAL_MS = 5000;

  @Transform(toBool)
  @IsBoolean()
  METRICS_ENABLED = true;

  @IsOptional()
  @IsString()
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?: string;

  @IsString()
  OTEL_SERVICE_NAME = 'amrutam-backend';
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  // Treat empty strings as "not set" so `.env` placeholders like STRIPE_SECRET_KEY= work.
  const cleaned = Object.fromEntries(Object.entries(config).filter(([, v]) => v !== ''));
  const validated = plainToInstance(EnvironmentVariables, cleaned, { enableImplicitConversion: false });
  const errors = validateSync(validated, { skipMissingProperties: false, whitelist: false });
  if (errors.length > 0) {
    const details = errors
      .map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n  ');
    throw new Error(`Invalid environment configuration:\n  ${details}`);
  }
  return validated;
}
