import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  controllers: [AdminController],
  providers: [AnalyticsService],
})
export class AdminModule {}
