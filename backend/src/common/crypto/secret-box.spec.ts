import { SecretBox, randomToken, sha256 } from './secret-box';

const KEY = 'a'.repeat(64);

describe('SecretBox', () => {
  it('round-trips plaintext', () => {
    const box = new SecretBox(KEY);
    const encrypted = box.encrypt('JBSWY3DPEHPK3PXP');
    expect(encrypted).not.toContain('JBSWY3DPEHPK3PXP');
    expect(box.decrypt(encrypted)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const box = new SecretBox(KEY);
    expect(box.encrypt('same')).not.toBe(box.encrypt('same'));
  });

  it('rejects tampered payloads', () => {
    const box = new SecretBox(KEY);
    const [iv, tag, data] = box.encrypt('secret').split('.');
    const tampered = `${iv}.${tag}.${data.slice(0, -2)}AA`;
    expect(() => box.decrypt(tampered)).toThrow();
  });

  it('rejects keys that are not 32 bytes', () => {
    expect(() => new SecretBox('abcd')).toThrow('32 bytes');
  });
});

describe('hash helpers', () => {
  it('sha256 is deterministic', () => {
    expect(sha256('x')).toBe(sha256('x'));
    expect(sha256('x')).toHaveLength(64);
  });

  it('randomToken is unique and url-safe', () => {
    const a = randomToken();
    expect(a).not.toBe(randomToken());
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
