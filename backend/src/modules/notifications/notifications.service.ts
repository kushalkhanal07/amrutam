import { Injectable } from '@nestjs/common';
import { NotificationChannel, Prisma } from '@prisma/client';
import { DbClient, PrismaService } from '../../prisma/prisma.service';

export type NotificationType =
  | 'booking.confirmed'
  | 'booking.cancelled'
  | 'consultation.started'
  | 'consultation.completed'
  | 'prescription.issued'
  | 'payment.succeeded'
  | 'payment.failed';

export interface EnqueueNotification {
  type: NotificationType;
  recipientId: string;
  channel?: NotificationChannel;
  /** Non-sensitive display data only. The worker never logs clinical details. */
  payload: Record<string, unknown>;
}

/**
 * Transactional outbox: notifications are inserted in the same transaction as
 * the business change, then delivered asynchronously by NotificationWorker.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(input: EnqueueNotification, db: DbClient = this.prisma): Promise<void> {
    await db.notificationJob.create({
      data: {
        type: input.type,
        recipientId: input.recipientId,
        channel: input.channel ?? NotificationChannel.EMAIL,
        payload: input.payload as Prisma.InputJsonValue,
      },
    });
  }
}
