import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import { AuditService } from '../audit-logs/audit.service';
import { AuthService } from './auth.service';
import { MfaService } from './mfa.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

describe('AuthService', () => {
  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
    refreshToken: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const passwords = { hash: jest.fn(), verify: jest.fn() };
  const tokens = {
    issueTokenPair: jest.fn(),
    signMfaToken: jest.fn().mockReturnValue('mfa-token'),
    verifyMfaToken: jest.fn(),
    hashRefreshToken: jest.fn((t: string) => `hash(${t})`),
  };
  const mfa = { verifyCode: jest.fn(), decryptSecret: jest.fn((s: string) => s) };
  const audit = { record: jest.fn(), recordSafe: jest.fn() };

  const service = new AuthService(
    prisma as never,
    passwords as unknown as PasswordService,
    tokens as unknown as TokenService,
    mfa as unknown as MfaService,
    audit as unknown as AuditService,
  );

  const user = {
    id: 'u1',
    email: 'a@b.c',
    role: Role.PATIENT,
    status: UserStatus.ACTIVE,
    passwordHash: 'h',
    mfaEnabled: false,
    mfaSecret: null,
  };
  const ctx = { ip: '127.0.0.1' };

  beforeEach(() => {
    jest.clearAllMocks();
    tokens.issueTokenPair.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      accessTokenExpiresIn: 900,
    });
  });

  describe('register', () => {
    it('rejects duplicate emails without touching the password hasher', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(
        service.register({ email: 'A@B.C', password: 'x'.repeat(10), firstName: 'A', lastName: 'B' }, ctx),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(passwords.hash).not.toHaveBeenCalled();
    });

    it('hashes the password, creates the user and audit in one transaction, and issues tokens', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      passwords.hash.mockResolvedValue('argon-hash');
      const tx = {
        user: { create: jest.fn().mockResolvedValue({ id: 'u1', email: 'a@b.c', role: Role.PATIENT }) },
      };
      prisma.$transaction.mockImplementation((fn: (t: unknown) => Promise<unknown>) => fn(tx));

      const result = await service.register(
        { email: 'A@B.C', password: 'x'.repeat(10), firstName: 'A', lastName: 'B' },
        ctx,
      );

      expect(tx.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'a@b.c', passwordHash: 'argon-hash', role: Role.PATIENT }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.register' }), tx);
      expect(result).toEqual({
        accessToken: 'a',
        refreshToken: 'r',
        accessTokenExpiresIn: 900,
        role: Role.PATIENT,
      });
    });
  });

  describe('login', () => {
    it('returns the same error for unknown email and wrong password, and audits the failure', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      await expect(service.login({ email: 'x@y.z', password: 'p' }, ctx)).rejects.toThrow(
        'Invalid email or password',
      );

      prisma.user.findUnique.mockResolvedValueOnce(user);
      passwords.verify.mockResolvedValue(false);
      await expect(service.login({ email: 'a@b.c', password: 'p' }, ctx)).rejects.toThrow(
        'Invalid email or password',
      );
      expect(audit.recordSafe).toHaveBeenCalledTimes(2);
      expect(audit.recordSafe).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.login.failure' }),
      );
    });

    it('issues tokens for valid credentials', async () => {
      prisma.user.findUnique.mockResolvedValue(user);
      passwords.verify.mockResolvedValue(true);
      const result = await service.login({ email: 'a@b.c', password: 'p' }, ctx);
      expect(result).toMatchObject({ accessToken: 'a', role: Role.PATIENT });
      expect(audit.recordSafe).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.login.success' }),
      );
    });

    it('returns an MFA challenge instead of tokens when MFA is enabled', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...user, mfaEnabled: true, mfaSecret: 'enc' });
      passwords.verify.mockResolvedValue(true);
      const result = await service.login({ email: 'a@b.c', password: 'p' }, ctx);
      expect(result).toEqual({ mfaRequired: true, mfaToken: 'mfa-token' });
      expect(tokens.issueTokenPair).not.toHaveBeenCalled();
    });

    it('blocks suspended accounts', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...user, status: UserStatus.SUSPENDED });
      passwords.verify.mockResolvedValue(true);
      await expect(service.login({ email: 'a@b.c', password: 'p' }, ctx)).rejects.toThrow('suspended');
    });
  });

  describe('refresh', () => {
    it('rejects unknown tokens', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.refresh('nope', ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('revokes the whole family when a rotated token is reused', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 't1',
        userId: 'u1',
        familyId: 'fam',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000),
        user,
      });
      await expect(service.refresh('old', ctx)).rejects.toThrow('reuse detected');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'fam', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(audit.recordSafe).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.refresh.reuse_detected' }),
      );
    });

    it('rotates a valid token: issues a new one in the same family and revokes the old', async () => {
      prisma.refreshToken.findUnique
        .mockResolvedValueOnce({
          id: 't1',
          userId: 'u1',
          familyId: 'fam',
          revokedAt: null,
          expiresAt: new Date(Date.now() + 1000),
          user,
        })
        .mockResolvedValueOnce({ id: 't2' });
      const result = await service.refresh('valid', ctx);
      expect(tokens.issueTokenPair).toHaveBeenCalledWith(user, ctx, 'fam');
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { revokedAt: expect.any(Date), replacedById: 't2' },
      });
      expect(result.refreshToken).toBe('r');
    });
  });
});
