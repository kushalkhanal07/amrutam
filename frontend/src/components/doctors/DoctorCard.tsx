import { ArrowRight, BadgeCheck, Languages } from 'lucide-react';
import { Link } from 'react-router';
import type { Doctor } from '@/lib/api/types';
import { cn } from '@/lib/utils/cn';
import { formatMoney, fullName } from '@/lib/utils/format';
import { Avatar } from '../ui/Avatar';
import { ButtonLink } from '../ui/Button';

export function doctorDisplayName(doctor: Pick<Doctor, 'user'>): string {
  return `Dr. ${fullName(doctor.user.profile)}`;
}

/**
 * Doctor directory card. Shows only fields the API supplies; nothing is invented.
 * Ratings are omitted until the backend actually stores them (ratingCount > 0).
 */
export function DoctorCard({ doctor, className }: { doctor: Doctor; className?: string }) {
  const name = doctorDisplayName(doctor);
  const hasRating = doctor.ratingCount > 0 && doctor.ratingAverage != null;
  return (
    <article
      className={cn(
        'surface group flex flex-col p-5 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]',
        className,
      )}
    >
      <div className="flex items-start gap-4">
        <Avatar name={fullName(doctor.user.profile)} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 className="font-display truncate text-lg text-ink">
            <Link to={`/doctors/${doctor.id}`} className="focus-visible:outline-none focus-visible:underline">
              {name}
            </Link>
          </h3>
          <p className="text-sm text-muted">{doctor.specialization}</p>
          {doctor.verificationStatus === 'VERIFIED' && (
            <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-success">
              <BadgeCheck className="size-3.5" aria-hidden /> Verified doctor
            </p>
          )}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {doctor.qualifications.length > 0 && (
          <div className="col-span-2">
            <dt className="sr-only">Qualifications</dt>
            <dd className="text-ink/80">{doctor.qualifications.join(' · ')}</dd>
          </div>
        )}
        {doctor.yearsOfExperience > 0 && (
          <div>
            <dt className="text-xs text-muted">Experience</dt>
            <dd className="font-medium">{doctor.yearsOfExperience} yrs</dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-muted">Consultation</dt>
          <dd className="font-medium">{formatMoney(doctor.consultationFeeMinor, doctor.currency)}</dd>
        </div>
        {hasRating && (
          <div>
            <dt className="text-xs text-muted">Rating</dt>
            <dd className="font-medium">
              {Number(doctor.ratingAverage).toFixed(1)} <span className="text-muted">({doctor.ratingCount})</span>
            </dd>
          </div>
        )}
        {doctor.languages.length > 0 && (
          <div className="col-span-2 flex items-center gap-1.5 text-muted">
            <Languages className="size-3.5" aria-hidden />
            <span className="text-xs uppercase tracking-wide">{doctor.languages.join(', ')}</span>
          </div>
        )}
      </dl>

      {doctor.bio && <p className="mt-3 line-clamp-2 text-sm text-muted">{doctor.bio}</p>}

      <div className="mt-auto flex gap-2 pt-5">
        <ButtonLink to={`/doctors/${doctor.id}`} variant="outline" size="sm" className="flex-1">
          View profile
        </ButtonLink>
        <ButtonLink to={`/book/${doctor.id}`} size="sm" className="flex-1" rightIcon={<ArrowRight className="size-4" />}>
          Book
        </ButtonLink>
      </div>
    </article>
  );
}
