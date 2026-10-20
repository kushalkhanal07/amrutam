import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: 'sm' | 'md';
  variant?: 'ghost' | 'outline';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'md', variant = 'ghost', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center rounded-md text-muted transition-colors hover:bg-mint hover:text-ink focus-visible:shadow-[var(--shadow-ring)] focus-visible:outline-none disabled:opacity-50',
        variant === 'outline' && 'border border-line bg-white',
        size === 'sm' ? 'size-8' : 'size-10',
        className,
      )}
      {...rest}
    />
  );
});
