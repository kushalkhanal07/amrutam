import { Module } from '@nestjs/common';
import { PrescriptionsModule } from '../prescriptions/prescriptions.module';
import { ConsultationsController } from './consultations.controller';
import { ConsultationsService } from './consultations.service';
import { SimulatedVideoProvider, VideoProvider } from './video.provider';

@Module({
  imports: [PrescriptionsModule],
  controllers: [ConsultationsController],
  providers: [ConsultationsService, { provide: VideoProvider, useClass: SimulatedVideoProvider }],
  exports: [ConsultationsService],
})
export class ConsultationsModule {}
