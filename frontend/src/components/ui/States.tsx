import { AlertTriangle, Inbox, RefreshCw, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { HttpError } from '@/lib/api/client';
import { Button } from './Button';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('shimmer rounded-md', className)} aria-hidden />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn('h-3.5', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('surface p-5', className)} aria-hidden>
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <SkeletonText className="mt-5" />
    </div>
  );
}

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <div role="status" className={cn('flex items-center justify-center py-10 text-muted', className)}>
      <RefreshCw className="size-5 animate-spin" aria-hidden />
      <span className="sr-only">{label}</span>
    </div>
  );
}

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className, compact }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center text-center', compact ? 'py-8' : 'py-14', className)}>
      <div className="flex size-14 items-center justify-center rounded-full bg-mint text-forest">
        <Icon className="size-6" aria-hidden />
      </div>
      <h3 className="mt-4 font-display text-xl text-ink">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}

export function describeError(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.status === 0) return error.message;
    if (error.status === 401) return 'Your session has expired. Please sign in again.';
    if (error.status === 403) return 'You do not have permission to view this.';
    if (error.status === 404) return 'We could not find what you were looking for.';
    if (error.status === 429) return 'Too many requests. Please wait a moment and try again.';
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}

export function ErrorState({ error, title = 'Something went wrong', onRetry, className, compact }: ErrorStateProps) {
  return (
    <div role="alert" className={cn('flex flex-col items-center text-center', compact ? 'py-8' : 'py-14', className)}>
      <div className="flex size-14 items-center justify-center rounded-full bg-error-soft text-error">
        <AlertTriangle className="size-6" aria-hidden />
      </div>
      <h3 className="mt-4 font-display text-xl text-ink">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted">{describeError(error)}</p>
      {onRetry && (
        <Button variant="outline" className="mt-5" onClick={onRetry} leftIcon={<RefreshCw className="size-4" />}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function InlineAlert({ tone = 'info', children, className }: { tone?: 'info' | 'error' | 'warning' | 'success'; children: ReactNode; className?: string }) {
  const tones = {
    info: 'bg-mint border-sage text-forest-deep',
    error: 'bg-error-soft border-error/20 text-error',
    warning: 'bg-warning-soft border-warning/20 text-warning',
    success: 'bg-success-soft border-success/20 text-success',
  };
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('rounded-md border px-4 py-3 text-sm', tones[tone], className)}>
      {children}
    </div>
  );
}
