import { HttpException, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import type { DefaultEventsMap } from 'socket.io/dist/typed-events';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { TokenService } from '../auth/token.service';
import { ChatMessageView, ChatService } from './chat.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MESSAGES_PER_WINDOW = 30;
const WINDOW_MS = 10_000;

interface SocketData {
  user: AuthUser;
  rooms: Set<string>;
  sentAt: number[];
}

type ChatSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

export interface PresenceEvent {
  userId: string;
  role: AuthUser['role'];
  online: boolean;
}

/** Acknowledgement shape for every request/response message: either a result or an error. */
type Ack<T> = T | { error: string };

const room = (consultationId: string) => `consultation:${consultationId}`;

/**
 * Real-time chat on the Socket.IO namespace `/chat`.
 *
 * Client -> server (with acknowledgement):
 *   chat:join   { consultationId }            -> { ok: true, online: PresenceEvent[] }
 *   chat:send   { consultationId, text }      -> ChatMessageView
 *   chat:typing { consultationId, typing }    (no ack)
 * Server -> client:
 *   chat:message  ChatMessageView  (to everyone in the consultation room, including the sender)
 *   chat:presence PresenceEvent
 *   chat:typing   { userId, typing }
 *   chat:error    { message }       (authentication failure, then the socket is closed)
 *
 * Authentication: `auth: { token }` in the handshake carries the normal access token.
 */
@WebSocketGateway({ namespace: '/chat' })
export class ChatGateway implements OnGatewayInit<Namespace>, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  private readonly server!: Namespace;

  constructor(
    private readonly tokens: TokenService,
    private readonly chat: ChatService,
  ) {}

  /**
   * Authentication runs as Socket.IO middleware so it completes before the
   * connection is accepted; messages can never race ahead of it. A rejected
   * handshake reaches the client as `connect_error` with `err.data.code`.
   */
  afterInit(server: Namespace): void {
    server.use((socket, next) => {
      void (async () => {
        const token = extractToken(socket);
        const user = token ? await this.tokens.verifyAccessToken(token) : null;
        if (!user) {
          const err = new Error('Your session has expired. Sign in again to use chat.') as Error & {
            data?: unknown;
          };
          err.data = { code: 'UNAUTHORIZED' };
          next(err);
          return;
        }
        (socket as ChatSocket).data = { user, rooms: new Set(), sentAt: [] };
        next();
      })().catch((err: unknown) => {
        this.logger.error({ err }, 'Chat authentication failed');
        next(new Error('Chat is unavailable right now'));
      });
    });
  }

  handleConnection(client: ChatSocket): void {
    if (!client.data?.user) {
      client.disconnect(true); // defensive: the middleware above always sets it
    }
  }

  handleDisconnect(client: ChatSocket): void {
    const data = client.data as Partial<SocketData>;
    if (!data.user || !data.rooms) return;
    for (const r of data.rooms) {
      // Still online through another tab/device? Then do not announce going offline.
      if (!this.isUserInRoom(r, data.user.id, client.id)) {
        client.to(r).emit('chat:presence', { userId: data.user.id, role: data.user.role, online: false });
      }
    }
  }

  @SubscribeMessage('chat:join')
  async join(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() body: { consultationId?: string } | undefined,
  ): Promise<Ack<{ ok: true; online: PresenceEvent[] }>> {
    return this.guarded(client, async (user) => {
      const consultationId = requireId(body?.consultationId);
      await this.chat.assertParticipant(user, consultationId);
      const r = room(consultationId);
      await client.join(r);
      client.data.rooms.add(r);
      client.to(r).emit('chat:presence', { userId: user.id, role: user.role, online: true });
      return { ok: true as const, online: this.onlineIn(r) };
    });
  }

  @SubscribeMessage('chat:send')
  async send(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() body: { consultationId?: string; text?: string } | undefined,
  ): Promise<Ack<ChatMessageView>> {
    return this.guarded(client, async (user) => {
      const consultationId = requireId(body?.consultationId);
      this.throttle(client);
      const message = await this.chat.send(user, consultationId, body?.text ?? '');
      this.server.to(room(consultationId)).emit('chat:message', message);
      return message;
    });
  }

  @SubscribeMessage('chat:typing')
  typing(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() body: { consultationId?: string; typing?: boolean } | undefined,
  ): void {
    const user = client.data?.user;
    const id = body?.consultationId;
    if (!user || !id || !client.data.rooms.has(room(id))) return;
    client.to(room(id)).emit('chat:typing', { userId: user.id, typing: Boolean(body?.typing) });
  }

  /** Runs a handler and converts failures into an acknowledgement the client can show. */
  private async guarded<T>(client: ChatSocket, fn: (user: AuthUser) => Promise<T>): Promise<Ack<T>> {
    const user = client.data?.user;
    if (!user) return { error: 'Not authenticated' };
    try {
      return await fn(user);
    } catch (err) {
      if (err instanceof HttpException) return { error: err.message };
      this.logger.error({ err }, 'Chat handler failed');
      return { error: 'Something went wrong. Please try again.' };
    }
  }

  private throttle(client: ChatSocket): void {
    const now = Date.now();
    client.data.sentAt = client.data.sentAt.filter((t) => now - t < WINDOW_MS);
    if (client.data.sentAt.length >= MESSAGES_PER_WINDOW) {
      throw new HttpException('You are sending messages too quickly. Please slow down.', 429);
    }
    client.data.sentAt.push(now);
  }

  private socketsIn(r: string): ChatSocket[] {
    const ids = this.server.adapter.rooms.get(r);
    if (!ids) return [];
    const out: ChatSocket[] = [];
    for (const id of ids) {
      const s = this.server.sockets.get(id) as ChatSocket | undefined;
      if (s?.data?.user) out.push(s);
    }
    return out;
  }

  private onlineIn(r: string): PresenceEvent[] {
    const seen = new Map<string, PresenceEvent>();
    for (const s of this.socketsIn(r)) {
      seen.set(s.data.user.id, { userId: s.data.user.id, role: s.data.user.role, online: true });
    }
    return [...seen.values()];
  }

  private isUserInRoom(r: string, userId: string, exceptSocketId: string): boolean {
    return this.socketsIn(r).some((s) => s.id !== exceptSocketId && s.data.user.id === userId);
  }
}

function extractToken(client: Socket): string | null {
  const auth = client.handshake.auth as { token?: unknown } | undefined;
  if (typeof auth?.token === 'string' && auth.token) return auth.token;
  const header = client.handshake.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7);
  return null;
}

function requireId(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new HttpException('consultationId must be a UUID', 400);
  }
  return value;
}
