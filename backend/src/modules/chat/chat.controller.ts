import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ChatService } from './chat.service';

@ApiTags('consultations')
@ApiBearerAuth()
@Controller('consultations')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get(':id/messages')
  @ApiOperation({
    summary: 'Chat history for a consultation (owner or admin). Live messages use Socket.IO /chat.',
  })
  messages(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.list(user, id);
  }
}
