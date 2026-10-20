import { AlertCircle, CheckCircle2, CircleDashed, Clock3, PlayCircle, RotateCcw, XCircle, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ConsultationStatus, DoctorVerificationStatus, PaymentStatus, SlotStatus } from '@/lib/api/types';
import { cn } from '@/lib/utils/cn';
import { humanizeStatus } from '@/lib/utils/format';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

const tones: Record<Tone, string> = {
  neutral: 'bg-mint text-ink border-line',
  info: 'bg-sage text-forest-deep border-sage',
  success: 'bg-success-soft text-success border-success/20',
  warning: 'bg-warning-soft text-warning border-warning/20',
  error: 'bg-error-soft text-error border-error/20',
};

export function Badge({ tone = 'neutral', icon: Icon, children, className }: { tone?: Tone; icon?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap', tones[tone], className)}>
      {Icon && <Icon className="size-3.5" aria-hidden />}
      {children}
    </span>
  );
}

const consultationTone: Record<ConsultationStatus, { tone: Tone; icon: LucideIcon }> = {
  SCHEDULED: { tone: 'info', icon: Clock3 },
  IN_PROGRESS: { tone: 'warning', icon: PlayCircle },
  COMPLETED: { tone: 'success', icon: CheckCircle2 },
  CANCELLED: { tone: 'neutral', icon: XCircle },
  NO_SHOW: { tone: 'error', icon: AlertCircle },
};

/** Status is conveyed by icon + text, never by colour alone. */
export function ConsultationStatusBadge({ status, className }: { status: ConsultationStatus; className?: string }) {
  const { tone, icon } = consultationTone[status];
  return (
    <Badge tone={tone} icon={icon} className={className}>
      {humanizeStatus(status)}
    </Badge>
  );
}

const paymentTone: Record<PaymentStatus, { tone: Tone; icon: LucideIcon }> = {
  PENDING: { tone: 'warning', icon: CircleDashed },
  PROCESSING: { tone: 'info', icon: Clock3 },
  SUCCEEDED: { tone: 'success', icon: CheckCircle2 },
  FAILED: { tone: 'error', icon: XCircle },
  REFUNDED: { tone: 'neutral', icon: RotateCcw },
};

export function PaymentStatusBadge({ status, className }: { status: PaymentStatus; className?: string }) {
  const { tone, icon } = paymentTone[status];
  return (
    <Badge tone={tone} icon={icon} className={className}>
      {status === 'SUCCEEDED' ? 'Paid' : humanizeStatus(status)}
    </Badge>
  );
}

export function VerificationBadge({ status }: { status: DoctorVerificationStatus }) {
  const map: Record<DoctorVerificationStatus, { tone: Tone; icon: LucideIcon; label: string }> = {
    VERIFIED: { tone: 'success', icon: CheckCircle2, label: 'Verified' },
    PENDING: { tone: 'warning', icon: Clock3, label: 'Pending review' },
    REJECTED: { tone: 'error', icon: XCircle, label: 'Rejected' },
  };
  const { tone, icon, label } = map[status];
  return (
    <Badge tone={tone} icon={icon}>
      {label}
    </Badge>
  );
}

export function SlotStatusBadge({ status }: { status: SlotStatus }) {
  const map: Record<SlotStatus, Tone> = { AVAILABLE: 'success', BOOKED: 'info', BLOCKED: 'neutral' };
  return <Badge tone={map[status]}>{humanizeStatus(status)}</Badge>;
}
