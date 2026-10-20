import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { HttpThrottlerGuard } from './common/guards/http-throttler.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AppConfigService } from './config/app-config.service';
import { AppConfigModule } from './config/config.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { AuthModule } from './modules/auth/auth.module';
import { AvailabilityModule } from './modules/availability/availability.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { ChatModule } from './modules/chat/chat.module';
import { ConsultationsModule } from './modules/consultations/consultations.module';
import { DoctorsModule } from './modules/doctors/doctors.module';
import { HealthModule } from './modules/health/health.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PrescriptionsModule } from './modules/prescriptions/prescriptions.module';
import { UsersModule } from './modules/users/users.module';
import { MetricsInterceptor } from './observability/metrics/metrics.interceptor';
import { MetricsModule } from './observability/metrics/metrics.module';
import { PrismaModule } from './prisma/prisma.module';

const QUIET_PATHS = ['/health', '/ready', '/metrics'];

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL'),
          // Correlation id: honour an incoming X-Request-Id, otherwise mint one, and echo it back.
          genReqId: (req, res) => {
            const incoming = req.headers['x-request-id'];
            const id = typeof incoming === 'string' && incoming.length <= 128 ? incoming : randomUUID();
            res.setHeader('X-Request-Id', id);
            return id;
          },
          autoLogging: { ignore: (req) => QUIET_PATHS.includes(req.url ?? '') },
          // Never log credentials, tokens or request bodies (which may contain medical data).
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["stripe-signature"]',
              'res.headers["set-cookie"]',
            ],
            censor: '[REDACTED]',
          },
          customProps: (req) => ({ requestId: (req as { id?: string }).id }),
          transport:
            config.isProduction || config.isTest
              ? undefined
              : { target: 'pino-pretty', options: { colorize: true, singleLine: true } },
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: config.get('RATE_LIMIT_TTL_SECONDS') * 1000,
            limit: config.get('RATE_LIMIT_MAX'),
          },
        ],
        skipIf: () => config.get('RATE_LIMIT_DISABLED'),
      }),
    }),
    PrismaModule,
    MetricsModule,
    AuditLogsModule,
    NotificationsModule,
    AuthModule,
    UsersModule,
    DoctorsModule,
    AvailabilityModule,
    BookingsModule,
    ConsultationsModule,
    ChatModule,
    PrescriptionsModule,
    PaymentsModule,
    AdminModule,
    HealthModule,
  ],
  providers: [
    // Order matters: rate limit first, then authentication, then role checks.
    { provide: APP_GUARD, useClass: HttpThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
})
export class AppModule {}
