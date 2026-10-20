import { Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface StepperProps {
  steps: string[];
  current: number; // 0-based
  className?: string;
}

export function Stepper({ steps, current, className }: StepperProps) {
  return (
    <ol className={cn('flex items-center gap-2 overflow-x-auto', className)} aria-label="Progress">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex shrink-0 items-center gap-2" aria-current={active ? 'step' : undefined}>
            <span
              className={cn(
                'flex size-7 items-center justify-center rounded-full border text-xs font-semibold',
                done && 'border-forest bg-forest text-white',
                active && 'border-forest bg-white text-forest',
                !done && !active && 'border-line bg-white text-muted',
              )}
            >
              {done ? <Check className="size-3.5" aria-hidden /> : i + 1}
            </span>
            <span className={cn('text-sm', active ? 'font-semibold text-ink' : done ? 'text-ink/80' : 'text-muted')}>
              {label}
              {done && <span className="sr-only"> (completed)</span>}
            </span>
            {i < steps.length - 1 && <span className={cn('mx-1 h-px w-6 sm:w-10', done ? 'bg-forest' : 'bg-line')} aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
