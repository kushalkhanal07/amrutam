import { Loader2 } from 'lucide-react';
import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { cn } from '@/lib/utils/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center font-medium whitespace-nowrap select-none transition-[background-color,box-shadow,transform] duration-150 focus-visible:shadow-[var(--shadow-ring)] focus-visible:outline-none active:translate-y-px';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-forest text-white hover:bg-forest-deep active:bg-forest-deep shadow-[0_1px_2px_rgba(23,63,50,0.2)] disabled:bg-forest/50',
  secondary: 'bg-sage text-forest-deep hover:bg-[#cfdfcf] active:bg-[#c4d6c4] disabled:opacity-60',
  outline: 'bg-white text-ink border border-line hover:border-forest/40 hover:bg-mint active:bg-sage/60 disabled:opacity-60',
  ghost: 'bg-transparent text-ink hover:bg-mint active:bg-sage/60 disabled:opacity-60',
  danger: 'bg-error text-white hover:bg-[#a33838] disabled:opacity-60',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5 rounded-md',
  md: 'h-11 px-4 text-[15px] gap-2 rounded-md',
  lg: 'h-12 px-6 text-base gap-2 rounded-lg',
};

export function buttonClassName(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', fullWidth?: boolean, className?: string): string {
  return cn(base, variants[variant], sizes[size], fullWidth && 'w-full', className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading = false, leftIcon, rightIcon, fullWidth, disabled, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={buttonClassName(variant, size, fullWidth, className)} {...rest}>
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
});

interface ButtonLinkProps extends Omit<LinkProps, 'className'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
  className?: string;
}

/** A router link that looks like a button. Use for navigation, never for actions. */
export function ButtonLink({ variant = 'primary', size = 'md', leftIcon, rightIcon, fullWidth, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClassName(variant, size, fullWidth, className)} {...rest}>
      {leftIcon}
      {children}
      {rightIcon}
    </Link>
  );
}

interface ExternalButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export function ExternalButtonLink({ variant = 'primary', size = 'md', leftIcon, rightIcon, className, children, ...rest }: ExternalButtonLinkProps) {
  return (
    <a className={buttonClassName(variant, size, false, className)} target="_blank" rel="noreferrer" {...rest}>
      {leftIcon}
      {children}
      {rightIcon}
    </a>
  );
}
