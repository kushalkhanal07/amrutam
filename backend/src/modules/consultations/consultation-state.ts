import { ConsultationStatus } from '@prisma/client';

/**
 * Consultation lifecycle.
 *
 *   SCHEDULED ──start──▶ IN_PROGRESS ──complete──▶ COMPLETED
 *       │                                           (terminal)
 *       ├──cancel──▶ CANCELLED (terminal)
 *       └──no-show─▶ NO_SHOW   (terminal)
 *
 * NO_SHOW exists so a missed appointment is distinguishable from a cancellation
 * for analytics and refund policy. IN_PROGRESS cannot be cancelled; it must be
 * completed (the doctor records what happened).
 */
const TRANSITIONS: Record<ConsultationStatus, readonly ConsultationStatus[]> = {
  SCHEDULED: [ConsultationStatus.IN_PROGRESS, ConsultationStatus.CANCELLED, ConsultationStatus.NO_SHOW],
  IN_PROGRESS: [ConsultationStatus.COMPLETED],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function canTransition(from: ConsultationStatus, to: ConsultationStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: ConsultationStatus): readonly ConsultationStatus[] {
  return TRANSITIONS[from];
}

export function isTerminal(status: ConsultationStatus): boolean {
  return TRANSITIONS[status].length === 0;
}
