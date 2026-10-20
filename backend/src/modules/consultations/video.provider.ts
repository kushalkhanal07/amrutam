import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppConfigService } from '../../config/app-config.service';

export interface VideoSession {
  sessionId: string;
  joinUrl: string;
  expiresAt: Date;
}

/**
 * Integration boundary for a call provider (Twilio Video, Daily, Agora...).
 * Only this class would change when a real provider is integrated.
 */
export abstract class VideoProvider {
  abstract createSession(consultationId: string): Promise<VideoSession>;
  /** Re-builds the join details for a session that was created earlier (page reloads, emails). */
  abstract getSession(consultationId: string, sessionId: string): VideoSession;
  abstract endSession(sessionId: string): Promise<void>;
}

/**
 * SIMULATED: the "room" is a page inside our own frontend (/session/:consultationId),
 * so the join link always opens. No media server is involved; the page itself
 * handles video, audio and chat modes.
 */
@Injectable()
export class SimulatedVideoProvider extends VideoProvider {
  constructor(private readonly config: AppConfigService) {
    super();
  }

  async createSession(consultationId: string): Promise<VideoSession> {
    await Promise.resolve();
    return this.getSession(consultationId, `sim_${randomUUID()}`);
  }

  getSession(consultationId: string, sessionId: string): VideoSession {
    return {
      sessionId,
      joinUrl: `${this.config.appUrl}/session/${consultationId}?room=${encodeURIComponent(sessionId)}`,
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    };
  }

  async endSession(): Promise<void> {
    await Promise.resolve();
  }
}
