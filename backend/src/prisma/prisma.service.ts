import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Single PrismaClient for the whole application. Connects eagerly so a bad
 * DATABASE_URL fails fast, and disconnects on shutdown so in-flight queries
 * finish and the pool is released.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // Query errors surface as exceptions and are logged by the exception filter when
    // they are unexpected; expected ones (e.g. unique-constraint claims) stay quiet.
    super({ log: [{ emit: 'event', level: 'warn' }] });
  }

  async onModuleInit(): Promise<void> {
    this.$on('warn' as never, (e: Prisma.LogEvent) => this.logger.warn(e.message));
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }

  /** Lightweight query used by readiness checks and metrics. */
  async ping(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}

/** Type for code that must work both inside and outside a transaction. */
export type DbClient = Prisma.TransactionClient | PrismaService;
