import { ConsultationStatus } from '@prisma/client';
import { allowedTransitions, canTransition, isTerminal } from './consultation-state';

describe('consultation state machine', () => {
  it('allows SCHEDULED -> IN_PROGRESS, CANCELLED, NO_SHOW', () => {
    expect(canTransition('SCHEDULED', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('SCHEDULED', 'CANCELLED')).toBe(true);
    expect(canTransition('SCHEDULED', 'NO_SHOW')).toBe(true);
    expect(canTransition('SCHEDULED', 'COMPLETED')).toBe(false);
  });

  it('allows IN_PROGRESS -> COMPLETED only', () => {
    expect(canTransition('IN_PROGRESS', 'COMPLETED')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'CANCELLED')).toBe(false);
    expect(canTransition('IN_PROGRESS', 'SCHEDULED')).toBe(false);
    expect(canTransition('IN_PROGRESS', 'NO_SHOW')).toBe(false);
  });

  it('treats COMPLETED, CANCELLED and NO_SHOW as terminal', () => {
    for (const status of ['COMPLETED', 'CANCELLED', 'NO_SHOW'] as ConsultationStatus[]) {
      expect(isTerminal(status)).toBe(true);
      expect(allowedTransitions(status)).toHaveLength(0);
      for (const target of Object.values(ConsultationStatus)) {
        expect(canTransition(status, target)).toBe(false);
      }
    }
  });

  it('never allows a self-transition', () => {
    for (const status of Object.values(ConsultationStatus)) {
      expect(canTransition(status, status)).toBe(false);
    }
  });
});
