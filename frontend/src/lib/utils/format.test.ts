import { describe, expect, it } from 'vitest';
import { formatMoney, fullName, humanizeStatus, initials } from './format';

describe('formatMoney', () => {
  it('converts minor units and uses the currency code', () => {
    expect(formatMoney(50000, 'INR')).toMatch(/500/);
    expect(formatMoney(123400, 'USD')).toMatch(/1,234/);
  });
  it('falls back for unknown currency codes', () => {
    expect(formatMoney(100, 'ZZZ')).toContain('ZZZ');
  });
});

describe('names and labels', () => {
  it('builds a full name and initials', () => {
    expect(fullName({ firstName: 'Asha', lastName: 'Verma' })).toBe('Asha Verma');
    expect(fullName(null)).toBe('Unknown');
    expect(initials('Asha Verma')).toBe('AV');
  });
  it('humanizes enum statuses', () => {
    expect(humanizeStatus('IN_PROGRESS')).toBe('In Progress');
    expect(humanizeStatus('NO_SHOW')).toBe('No Show');
  });
});
