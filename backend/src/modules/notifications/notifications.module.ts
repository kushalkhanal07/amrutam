import { Global, Module } from '@nestjs/common';
import { NotificationSender } from './notification-sender';
import { NotificationWorker } from './notification.worker';
import { NotificationsService } from './notifications.service';

@Global()
@Module({
  providers: [NotificationsService, NotificationSender, NotificationWorker],
  exports: [NotificationsService, NotificationWorker],
})
export class NotificationsModule {}
