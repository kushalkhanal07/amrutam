import { CalendarDays, Clock3, Video } from 'lucide-react';
import { Link } from 'react-router';
import type { Consultation } from '@/lib/api/types';
import { cn } from '@/lib/utils/cn';
import { formatDate, formatTime, fullName, humanizeStatus } from '@/lib/utils/format';
import { Avatar } from '../ui/Avatar';
import { ConsultationStatusBadge, PaymentStatusBadge } from '../ui/Badge';

interface AppointmentCardProps {
  consultation: Consultation;
  /** Which party the viewer is: decides whose name is shown. */
  perspective: 'patient' | 'doctor';
  href: string;
  className?: string;
  compact?: boolean;
}

export function AppointmentCard({ consultation: c, perspective, href, className, compact }: AppointmentCardProps) {
  const counterpart = perspective === 'patient' ? `Dr. ${fullName(c.doctor.user.profile)}` : fullName(c.patient.profile);
  const subtitle = perspective === 'patient' ? c.doctor.specialization : (c.reasonForVisit ?? 'No reason given');
  return (
    <Link
      to={href}
      className={cn(
        'surface group flex gap-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] focus-visible:outline-none focus-visible:shadow-[var(--shadow-ring)]',
        compact ? 'p-4' : 'p-5',
        className,
      )}
    >
      <Avatar name={counterpart.replace(/^Dr\. /, '')} size={compact ? 'md' : 'lg'} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-display truncate text-lg text-ink">{counterpart}</p>
            <p className="truncate text-sm text-muted">{subtitle}</p>
          </div>
          <ConsultationStatusBadge status={c.status} />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink/80">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-4 text-muted" aria-hidden /> {formatDate(c.scheduledStartsAt)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="size-4 text-muted" aria-hidden /> {formatTime(c.scheduledStartsAt)} – {formatTime(c.scheduledEndsAt)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Video className="size-4 text-muted" aria-hidden /> {humanizeStatus(c.mode)}
          </span>
        </div>
        {c.payment && perspective === 'patient' && c.status === 'SCHEDULED' && (
          <div className="mt-3">
            <PaymentStatusBadge status={c.payment.status} />
          </div>
        )}
      </div>
    </Link>
  );
}
