import { Link } from 'react-router';
import { cn } from '@/lib/utils/cn';

export function Logo({ to = '/', className, light = false }: { to?: string; className?: string; light?: boolean }) {
  return (
    <Link to={to} className={cn('inline-flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:shadow-[var(--shadow-ring)]', className)} aria-label="Amrutam home">
      <span className={cn('flex size-9 items-center justify-center rounded-lg', light ? 'bg-white/15' : 'bg-forest')}>
        <svg viewBox="0 0 32 32" className="size-6" aria-hidden>
          <path d="M16 25c-5-3-8-7-8-11a8 8 0 0 1 16 0c0 4-3 8-8 11Z" fill={light ? '#DCE8DC' : '#DCE8DC'} />
          <path d="M16 25V11" stroke="#245C45" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M16 17c2-1 3-3 3-5M16 20c-2-1-3-3-3-5" stroke="#245C45" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </span>
      <span className={cn('font-display text-xl leading-none', light ? 'text-white' : 'text-forest-deep')}>
        Amrutam
        <span className={cn('ml-1.5 align-middle font-sans text-[10px] font-semibold uppercase tracking-[0.18em]', light ? 'text-sage/80' : 'text-muted')}>Care</span>
      </span>
    </Link>
  );
}
