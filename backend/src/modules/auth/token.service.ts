import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role, UserStatus } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { randomUUID } from 'node:crypto';
import { randomToken, sha256 } from '../../common/crypto/secret-box';
import { addDays, parseDuration } from '../../common/utils/dates';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
  type: 'access';
}

export interface MfaTokenPayload {
  sub: string;
  type: 'mfa';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
}

export interface ClientMeta {
  userAgent?: string;
  ip?: string;
}

/**
 * Access tokens: short-lived signed JWTs (stateless).
 * Refresh tokens: opaque random strings; only their SHA-256 hash is stored.
 * Rotation: each refresh revokes the old token and issues a new one in the
 * same family. Reuse of a revoked token revokes the whole family.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  get accessTtlSeconds(): number {
    return Math.floor(parseDuration(this.config.get('JWT_ACCESS_TTL')) / 1000);
  }

  signAccessToken(user: { id: string; email: string; role: Role }): string {
    const payload: AccessTokenPayload = { sub: user.id, email: user.email, role: user.role, type: 'access' };
    return this.jwt.sign(payload, { expiresIn: this.accessTtlSeconds });
  }

  signMfaToken(userId: string): string {
    const payload: MfaTokenPayload = { sub: userId, type: 'mfa' };
    return this.jwt.sign(payload, { expiresIn: 300 });
  }

  /**
   * Validates an access token outside the HTTP guard chain (WebSocket handshakes).
   * Mirrors JwtStrategy: the user must still exist and be active.
   */
  async verifyAccessToken(token: string): Promise<AuthUser | null> {
    let payload: AccessTokenPayload;
    try {
      payload = this.jwt.verify<AccessTokenPayload>(token);
    } catch {
      return null;
    }
    if (payload.type !== 'access') return null;
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, status: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE) return null;
    return { id: user.id, email: user.email, role: user.role };
  }

  verifyMfaToken(token: string): MfaTokenPayload | null {
    try {
      const payload = this.jwt.verify<MfaTokenPayload>(token);
      return payload.type === 'mfa' ? payload : null;
    } catch {
      return null;
    }
  }

  async issueTokenPair(
    user: { id: string; email: string; role: Role },
    meta: ClientMeta,
    familyId: string = randomUUID(),
  ): Promise<TokenPair> {
    const refreshToken = randomToken();
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        familyId,
        expiresAt: addDays(new Date(), this.config.get('REFRESH_TOKEN_TTL_DAYS')),
        userAgent: meta.userAgent?.slice(0, 255),
        ip: meta.ip,
      },
    });
    return {
      accessToken: this.signAccessToken(user),
      refreshToken,
      accessTokenExpiresIn: this.accessTtlSeconds,
    };
  }

  hashRefreshToken(token: string): string {
    return sha256(token);
  }
}
