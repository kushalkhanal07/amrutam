import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConsultationsModule } from '../consultations/consultations.module';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';

/** Real-time consultation chat: REST history + Socket.IO gateway on `/chat`. */
@Module({
  imports: [AuthModule, ConsultationsModule],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway],
})
export class ChatModule {}
