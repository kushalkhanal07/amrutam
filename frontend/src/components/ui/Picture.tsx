import { useState, type ImgHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

interface PictureProps extends ImgHTMLAttributes<HTMLImageElement> {
  /** Shown when the remote image fails to load (offline, blocked, removed). */
  fallbackTone?: 'sage' | 'cream' | 'forest';
}

/**
 * Editorial image with a botanical CSS fallback. Remote photography is
 * optional: the layout never breaks when the network is unavailable.
 */
export function Picture({ className, fallbackTone = 'sage', alt = '', onError, ...rest }: PictureProps) {
  const [failed, setFailed] = useState(false);
  const tones = {
    sage: 'from-sage via-mint to-cream',
    cream: 'from-cream via-mint to-sage',
    forest: 'from-forest-deep via-forest to-forest-soft',
  };
  if (failed || !rest.src) {
    return (
      <div role="img" aria-label={alt} className={cn('relative overflow-hidden bg-gradient-to-br', tones[fallbackTone], className)}>
        <BotanicalMark className={cn('absolute -right-8 -bottom-8 h-[70%] w-auto opacity-40', fallbackTone === 'forest' ? 'text-sage' : 'text-forest')} />
      </div>
    );
  }
  return (
    <img
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cn('object-cover', className)}
      onError={(e) => {
        setFailed(true);
        onError?.(e);
      }}
      {...rest}
    />
  );
}

export function BotanicalMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M100 185C100 120 100 70 100 20" />
      <path d="M100 150c-30-4-54-30-58-62 32 4 55 30 58 62Z" />
      <path d="M100 150c30-4 54-30 58-62-32 4-55 30-58 62Z" />
      <path d="M100 105c-22-3-40-22-43-46 24 3 40 22 43 46Z" />
      <path d="M100 105c22-3 40-22 43-46-24 3-40 22-43 46Z" />
      <path d="M100 65c-14-2-25-14-27-29 15 2 25 14 27 29Z" />
      <path d="M100 65c14-2 25-14 27-29-15 2-25 14-27 29Z" />
    </svg>
  );
}
