import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NotificationStatus } from '@prisma/client';
import { backoffDelay } from '../../common/utils/retry';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationSender } from './notification-sender';

/**
 * Polls the NotificationJob table and delivers pending jobs. Runs in-process so
 * no external queue is needed. Failed deliveries are retried with
 * exponential backoff + jitter up to `maxAttempts`, then marked FAILED.
 * The same loop sweeps expired idempotency records and refresh tokens.
 */
@Injectable()
export class NotificationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationWorker.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private ticks = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly sender: NotificationSender,
  ) {}

  onModuleInit(): void {
    if (!this.config.get('NOTIFICATION_WORKER_ENABLED') || this.config.isTest) {
      return;
    }
    const interval = this.config.get('NOTIFICATION_POLL_INTERVAL_MS');
    this.timer = setInterval(() => void this.tick(), interval);
    this.timer.unref();
    this.logger.log(`Notification worker started (poll every ${interval}ms)`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  /** One polling cycle. Public so tests can drive it deterministically. */
  async tick(batchSize = 20): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      this.ticks += 1;
      if (this.ticks % 12 === 1) {
        await this.sweepExpired();
      }
      return await this.processBatch(batchSize);
    } catch (err) {
      this.logger.error({ err }, 'Notification worker tick failed');
      return 0;
    } finally {
      this.running = false;
    }
  }

  private async processBatch(batchSize: number): Promise<number> {
    const now = new Date();
    const candidates = await this.prisma.notificationJob.findMany({
      where: { status: NotificationStatus.PENDING, nextRunAt: { lte: now } },
      orderBy: { nextRunAt: 'asc' },
      take: batchSize,
      include: { recipient: { select: { email: true } } },
    });

    let processed = 0;
    for (const job of candidates) {
      // Conditional update = claim. If another worker instance already took it, skip.
      const claimed = await this.prisma.notificationJob.updateMany({
        where: { id: job.id, status: NotificationStatus.PENDING },
        data: { status: NotificationStatus.PROCESSING, attempts: { increment: 1 } },
      });
      if (claimed.count === 0) continue;

      try {
        await this.sender.send(job, job.recipient.email);
        await this.prisma.notificationJob.update({
          where: { id: job.id },
          data: { status: NotificationStatus.SENT, sentAt: new Date(), lastError: null },
        });
      } catch (err) {
        const attempts = job.attempts + 1;
        const exhausted = attempts >= job.maxAttempts;
        const delay = backoffDelay(attempts, 1000, 5 * 60 * 1000);
        await this.prisma.notificationJob.update({
          where: { id: job.id },
          data: {
            status: exhausted ? NotificationStatus.FAILED : NotificationStatus.PENDING,
            nextRunAt: new Date(Date.now() + delay),
            lastError: err instanceof Error ? err.message.slice(0, 500) : 'unknown error',
          },
        });
      }
      processed += 1;
    }
    return processed;
  }

  private async sweepExpired(): Promise<void> {
    const now = new Date();
    const [idem, tokens] = await Promise.all([
      this.prisma.idempotencyRecord.deleteMany({ where: { expiresAt: { lt: now } } }),
      this.prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    ]);
    if (idem.count || tokens.count) {
      this.logger.debug(`Swept ${idem.count} idempotency records and ${tokens.count} refresh tokens`);
    }
  }
}
