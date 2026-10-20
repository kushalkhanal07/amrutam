import './observability/tracing'; // must be first: patches http/express/pg before they load

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { setupSwagger } from './swagger';
import { shutdownTracing } from './observability/tracing';

/** Socket.IO shares the HTTP server; this applies the same CORS origins to WebSocket handshakes. */
class CorsIoAdapter extends IoAdapter {
  constructor(
    app: NestExpressApplication,
    private readonly origins: string[],
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): unknown {
    return super.createIOServer(port, { ...options, cors: { origin: this.origins, credentials: true } });
  }
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true, // needed for Stripe webhook signature verification
  });
  const config = app.get(AppConfigService);
  const logger = app.get(Logger);
  app.useLogger(logger);

  if (config.isProduction) {
    app.set('trust proxy', 1); // correct client IPs behind a load balancer
  }
  app.use(helmet());
  app.useWebSocketAdapter(new CorsIoAdapter(app, config.corsOrigins));
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Idempotent-Replayed'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  if (config.swaggerEnabled) {
    setupSwagger(app);
    logger.log('Swagger UI enabled at /docs');
  }

  app.enableShutdownHooks(); // SIGTERM -> close server, run OnModuleDestroy hooks (Prisma, worker)
  const port = config.get('PORT');
  await app.listen(port);
  logger.log(`Amrutam API listening on http://localhost:${port} (${config.nodeEnv})`);

  const stop = async (signal: string) => {
    logger.log(`Received ${signal}, shutting down`);
    await app.close();
    await shutdownTracing();
    process.exit(0);
  };
  process.once('SIGTERM', () => void stop('SIGTERM'));
  process.once('SIGINT', () => void stop('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('Fatal startup error', err);
  process.exit(1);
});
