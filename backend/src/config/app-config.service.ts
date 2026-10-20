import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables, NodeEnv } from './env.validation';

/**
 * Thin typed wrapper over ConfigService so modules never read `process.env`
 * directly and every key is spelled once.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {}

  get<K extends keyof EnvironmentVariables>(key: K): EnvironmentVariables[K] {
    return this.config.get(key, { infer: true });
  }

  get nodeEnv(): NodeEnv {
    return this.get('NODE_ENV');
  }

  get isProduction(): boolean {
    return this.nodeEnv === NodeEnv.Production;
  }

  get isTest(): boolean {
    return this.nodeEnv === NodeEnv.Test;
  }

  get corsOrigins(): string[] {
    return this.get('CORS_ORIGIN')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  }

  /** Explicit SWAGGER_ENABLED wins; otherwise on in development/test and off in production. */
  get swaggerEnabled(): boolean {
    return this.get('SWAGGER_ENABLED') ?? !this.isProduction;
  }

  get stripeConfigured(): boolean {
    return Boolean(this.get('STRIPE_SECRET_KEY'));
  }

  /** Frontend base URL without a trailing slash. */
  get appUrl(): string {
    return this.get('APP_URL').replace(/\/+$/, '');
  }

  get smtpConfigured(): boolean {
    return Boolean(this.get('SMTP_HOST')) && !this.isTest;
  }
}
