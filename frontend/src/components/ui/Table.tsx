import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { Button } from './Button';

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('surface overflow-hidden', className)}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">{children}</table>
      </div>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th scope="col" className={cn('bg-mint/70 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted', className)}>
      {children}
    </th>
  );
}

export function Td({ children, className, colSpan }: { children?: ReactNode; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cn('border-t border-line px-4 py-3 align-middle text-ink', className)}>
      {children}
    </td>
  );
}

interface PaginationProps {
  page: number;
  totalPages: number;
  total?: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function Pagination({ page, totalPages, total, onPageChange, className }: PaginationProps) {
  if (totalPages <= 1 && !total) return null;
  return (
    <nav aria-label="Pagination" className={cn('flex items-center justify-between gap-3', className)}>
      <p className="text-sm text-muted">
        Page {page} of {Math.max(totalPages, 1)}
        {typeof total === 'number' && ` · ${total} result${total === 1 ? '' : 's'}`}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1} leftIcon={<ChevronLeft className="size-4" />}>
          Previous
        </Button>
        <Button variant="outline" size="sm" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} rightIcon={<ChevronRight className="size-4" />}>
          Next
        </Button>
      </div>
    </nav>
  );
}
