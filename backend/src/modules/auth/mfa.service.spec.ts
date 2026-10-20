import { authenticator } from 'otplib';
import { AppConfigService } from '../../config/app-config.service';
import { MfaService } from './mfa.service';

describe('MfaService', () => {
  const config = {
    get: (key: string) => (key === 'MFA_ENCRYPTION_KEY' ? '1'.repeat(64) : 'Amrutam'),
  } as unknown as AppConfigService;
  const service = new MfaService(config);

  it('generates a secret and a valid otpauth url', () => {
    const secret = service.generateSecret();
    expect(secret.length).toBeGreaterThan(10);
    const url = service.otpauthUrl('doc@example.com', secret);
    expect(url).toMatch(/^otpauth:\/\/totp\/Amrutam:doc%40example.com\?secret=/);
  });

  it('verifies a current TOTP code and rejects a wrong one', () => {
    const secret = service.generateSecret();
    const code = authenticator.generate(secret);
    expect(service.verifyCode(secret, code)).toBe(true);
    expect(service.verifyCode(secret, '000000')).toBe(false);
  });

  it('encrypts the secret at rest and decrypts it back', () => {
    const secret = service.generateSecret();
    const stored = service.encryptSecret(secret);
    expect(stored).not.toContain(secret);
    expect(service.decryptSecret(stored)).toBe(secret);
  });
});
