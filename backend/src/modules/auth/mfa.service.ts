import { Injectable } from '@nestjs/common';
import { authenticator } from 'otplib';
import { SecretBox } from '../../common/crypto/secret-box';
import { AppConfigService } from '../../config/app-config.service';

/**
 * TOTP (RFC 6238) multi-factor authentication.
 * Scope: available to DOCTOR and ADMIN accounts (the accounts that can read
 * other people's medical data). Secrets are encrypted at rest with AES-256-GCM.
 */
@Injectable()
export class MfaService {
  private readonly box: SecretBox;

  constructor(private readonly config: AppConfigService) {
    this.box = new SecretBox(config.get('MFA_ENCRYPTION_KEY'));
    authenticator.options = { window: 1 };
  }

  generateSecret(): string {
    return authenticator.generateSecret();
  }

  otpauthUrl(email: string, secret: string): string {
    return authenticator.keyuri(email, this.config.get('MFA_ISSUER'), secret);
  }

  verifyCode(secret: string, code: string): boolean {
    try {
      return authenticator.check(code, secret);
    } catch {
      return false;
    }
  }

  encryptSecret(secret: string): string {
    return this.box.encrypt(secret);
  }

  decryptSecret(encrypted: string): string {
    return this.box.decrypt(encrypted);
  }
}
