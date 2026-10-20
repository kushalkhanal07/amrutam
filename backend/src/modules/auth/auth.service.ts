import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import { RequestContext } from '../../common/decorators/request-context.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditAction, AuditService } from '../audit-logs/audit.service';
import { LoginDto, MfaRequiredResponse, RegisterDto, TokenPairResponse } from './dto/auth.dto';
import { MfaService } from './mfa.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

const MFA_ELIGIBLE_ROLES: Role[] = [Role.DOCTOR, Role.ADMIN];

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly mfa: MfaService,
    private readonly audit: AuditService,
  ) {}

  async register(dto: RegisterDto, ctx: RequestContext): Promise<TokenPairResponse> {
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      throw new ConflictException('Email is already registered');
    }
    const role = dto.role ?? Role.PATIENT;
    const passwordHash = await this.passwords.hash(dto.password);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          role,
          profile: { create: { firstName: dto.firstName, lastName: dto.lastName, phone: dto.phone } },
        },
        select: { id: true, email: true, role: true },
      });
      await this.audit.record(
        {
          action: AuditAction.AUTH_REGISTER,
          entityType: 'User',
          entityId: created.id,
          actorId: created.id,
          actorRole: role,
          context: ctx,
        },
        tx,
      );
      return created;
    });

    const pair = await this.tokens.issueTokenPair(user, ctx);
    return { ...pair, role: user.role };
  }

  async login(dto: LoginDto, ctx: RequestContext): Promise<TokenPairResponse | MfaRequiredResponse> {
    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    const valid = user ? await this.passwords.verify(user.passwordHash, dto.password) : false;

    if (!user || !valid) {
      await this.audit.recordSafe({
        action: AuditAction.AUTH_LOGIN_FAILURE,
        entityType: 'User',
        entityId: user?.id,
        metadata: { reason: user ? 'bad_password' : 'unknown_email' },
        context: ctx,
      });
      // Same message for both cases so attackers cannot enumerate accounts.
      throw new UnauthorizedException('Invalid email or password');
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Account is suspended');
    }
    if (user.mfaEnabled) {
      return { mfaRequired: true, mfaToken: this.tokens.signMfaToken(user.id) };
    }
    return this.completeLogin(user, ctx);
  }

  async verifyMfa(mfaToken: string, code: string, ctx: RequestContext): Promise<TokenPairResponse> {
    const payload = this.tokens.verifyMfaToken(mfaToken);
    if (!payload) {
      throw new UnauthorizedException('Invalid or expired MFA token');
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.mfaEnabled || !user.mfaSecret || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('MFA is not available for this account');
    }
    if (!this.mfa.verifyCode(this.mfa.decryptSecret(user.mfaSecret), code)) {
      await this.audit.recordSafe({
        action: AuditAction.AUTH_MFA_FAILURE,
        entityType: 'User',
        entityId: user.id,
        actorId: user.id,
        context: ctx,
      });
      throw new UnauthorizedException('Invalid MFA code');
    }
    return this.completeLogin(user, ctx);
  }

  private async completeLogin(
    user: { id: string; email: string; role: Role },
    ctx: RequestContext,
  ): Promise<TokenPairResponse> {
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.recordSafe({
      action: AuditAction.AUTH_LOGIN_SUCCESS,
      entityType: 'User',
      entityId: user.id,
      actorId: user.id,
      actorRole: user.role,
      context: ctx,
    });
    const pair = await this.tokens.issueTokenPair(user, ctx);
    return { ...pair, role: user.role };
  }

  /** Rotates a refresh token. Reuse of an already-rotated token revokes the entire family. */
  async refresh(rawToken: string, ctx: RequestContext): Promise<TokenPairResponse> {
    const tokenHash = this.tokens.hashRefreshToken(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (stored.revokedAt) {
      // Token reuse: someone replayed an old token. Kill every token in the family.
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.recordSafe({
        action: AuditAction.AUTH_REFRESH_REUSE,
        entityType: 'User',
        entityId: stored.userId,
        actorId: stored.userId,
        metadata: { familyId: stored.familyId },
        context: ctx,
      });
      throw new UnauthorizedException('Refresh token reuse detected; please log in again');
    }
    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }
    if (stored.user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Account is suspended');
    }

    const pair = await this.tokens.issueTokenPair(stored.user, ctx, stored.familyId);
    const replacement = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.tokens.hashRefreshToken(pair.refreshToken) },
      select: { id: true },
    });
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedById: replacement?.id },
    });
    return { ...pair, role: stored.user.role };
  }

  /** Revokes the refresh token family (logs out this device). Always succeeds for the owner. */
  async logout(userId: string, rawToken: string, ctx: RequestContext): Promise<void> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.tokens.hashRefreshToken(rawToken) },
    });
    if (stored && stored.userId === userId) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await this.audit.recordSafe({
      action: AuditAction.AUTH_LOGOUT,
      entityType: 'User',
      entityId: userId,
      actorId: userId,
      context: ctx,
    });
  }

  // ---- MFA management -------------------------------------------------------

  async setupMfa(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.requireUser(userId);
    if (!MFA_ELIGIBLE_ROLES.includes(user.role)) {
      throw new ForbiddenException('MFA is available for doctor and admin accounts');
    }
    if (user.mfaEnabled) {
      throw new BadRequestException('MFA is already enabled');
    }
    const secret = this.mfa.generateSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: this.mfa.encryptSecret(secret) },
    });
    return { secret, otpauthUrl: this.mfa.otpauthUrl(user.email, secret) };
  }

  async enableMfa(userId: string, code: string, ctx: RequestContext): Promise<void> {
    const user = await this.requireUser(userId);
    if (!user.mfaSecret) {
      throw new BadRequestException('Call /auth/mfa/setup first');
    }
    if (!this.mfa.verifyCode(this.mfa.decryptSecret(user.mfaSecret), code)) {
      throw new UnauthorizedException('Invalid MFA code');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } });
    await this.audit.recordSafe({
      action: AuditAction.AUTH_MFA_ENABLED,
      entityType: 'User',
      entityId: userId,
      actorId: userId,
      actorRole: user.role,
      context: ctx,
    });
  }

  async disableMfa(userId: string, code: string, ctx: RequestContext): Promise<void> {
    const user = await this.requireUser(userId);
    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new BadRequestException('MFA is not enabled');
    }
    if (!this.mfa.verifyCode(this.mfa.decryptSecret(user.mfaSecret), code)) {
      throw new UnauthorizedException('Invalid MFA code');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: false, mfaSecret: null } });
    await this.audit.recordSafe({
      action: AuditAction.AUTH_MFA_DISABLED,
      entityType: 'User',
      entityId: userId,
      actorId: userId,
      actorRole: user.role,
      context: ctx,
    });
  }

  private async requireUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
