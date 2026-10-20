import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConsultationStatus, Prisma, Role } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { ConsultationsService } from '../consultations/consultations.service';

export const MAX_MESSAGE_LENGTH = 2000;

const messageSelect = {
  id: true,
  consultationId: true,
  senderId: true,
  text: true,
  createdAt: true,
  sender: { select: { role: true, profile: { select: { firstName: true, lastName: true } } } },
} satisfies Prisma.ChatMessageSelect;

type MessageRow = Prisma.ChatMessageGetPayload<{ select: typeof messageSelect }>;

export interface ChatMessageView {
  id: string;
  consultationId: string;
  senderId: string;
  senderRole: Role;
  senderName: string;
  text: string;
  createdAt: Date;
}

/** Chat messages are clinical content: stored, never logged. */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consultations: ConsultationsService,
  ) {}

  /** Throws 403/404 unless the user may see the consultation. */
  async assertParticipant(user: AuthUser, consultationId: string) {
    return this.consultations.findOneForUser(user, consultationId);
  }

  async list(user: AuthUser, consultationId: string, limit = 500): Promise<ChatMessageView[]> {
    await this.assertParticipant(user, consultationId);
    const rows = await this.prisma.chatMessage.findMany({
      where: { consultationId },
      select: messageSelect,
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    return rows.map(toView);
  }

  async send(user: AuthUser, consultationId: string, rawText: string): Promise<ChatMessageView> {
    const text = typeof rawText === 'string' ? rawText.trim() : '';
    if (!text) throw new BadRequestException('Message cannot be empty');
    if (text.length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestException(`Message is too long (max ${MAX_MESSAGE_LENGTH} characters)`);
    }
    if (user.role !== Role.PATIENT && user.role !== Role.DOCTOR) {
      throw new ForbiddenException('Only the patient and the doctor can send messages');
    }
    const c = await this.assertParticipant(user, consultationId);
    if (c.status !== ConsultationStatus.IN_PROGRESS) {
      throw new ConflictException('Messages can only be sent while the consultation is in progress');
    }
    const row = await this.prisma.chatMessage.create({
      data: { consultationId, senderId: user.id, text },
      select: messageSelect,
    });
    return toView(row);
  }
}

function toView(m: MessageRow): ChatMessageView {
  const p = m.sender.profile;
  const name = [p?.firstName, p?.lastName].filter(Boolean).join(' ');
  return {
    id: m.id,
    consultationId: m.consultationId,
    senderId: m.senderId,
    senderRole: m.sender.role,
    senderName: m.sender.role === Role.DOCTOR && name ? `Dr. ${name}` : name || 'Participant',
    text: m.text,
    createdAt: m.createdAt,
  };
}
