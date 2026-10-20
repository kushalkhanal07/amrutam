import { format, isSameDay, startOfDay } from 'date-fns';
import { useMemo } from 'react';
import type { Slot } from '@/lib/api/types';
import { cn } from '@/lib/utils/cn';
import { formatRelativeDay, formatTime } from '@/lib/utils/format';
import { EmptyState } from '../ui/States';
import { CalendarX2 } from 'lucide-react';

export interface SlotDay {
  date: Date;
  slots: Slot[];
}

/** Groups slots by local calendar day, sorted ascending. */
export function groupSlotsByDay(slots: Slot[]): SlotDay[] {
  const map = new Map<string, SlotDay>();
  for (const slot of [...slots].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const day = startOfDay(new Date(slot.startsAt));
    const key = day.toISOString();
    const entry = map.get(key) ?? { date: day, slots: [] };
    entry.slots.push(slot);
    map.set(key, entry);
  }
  return Array.from(map.values());
}

interface SlotPickerProps {
  slots: Slot[];
  selectedDay: Date | null;
  selectedSlotId: string | null;
  onSelectDay: (day: Date) => void;
  onSelectSlot: (slot: Slot) => void;
  disabled?: boolean;
}

/** Day strip + time grid. Selected state is shown with colour, a check mark and aria-pressed. */
export function SlotPicker({ slots, selectedDay, selectedSlotId, onSelectDay, onSelectSlot, disabled }: SlotPickerProps) {
  const days = useMemo(() => groupSlotsByDay(slots), [slots]);
  const activeDay = selectedDay ?? days[0]?.date ?? null;
  const active = days.find((d) => activeDay && isSameDay(d.date, activeDay));

  if (days.length === 0) {
    return <EmptyState compact icon={CalendarX2} title="No open slots in this period" description="Try a wider date range or another doctor." />;
  }

  return (
    <div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2" role="tablist" aria-label="Available days">
        {days.map((d) => {
          const selected = activeDay ? isSameDay(d.date, activeDay) : false;
          return (
            <button
              key={d.date.toISOString()}
              type="button"
              role="tab"
              aria-selected={selected}
              disabled={disabled}
              onClick={() => onSelectDay(d.date)}
              className={cn(
                'flex min-w-[88px] shrink-0 flex-col items-center rounded-lg border px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:shadow-[var(--shadow-ring)]',
                selected ? 'border-forest bg-forest text-white' : 'border-line bg-white text-ink hover:border-forest/40 hover:bg-mint',
              )}
            >
              <span className={cn('text-[11px] font-semibold uppercase tracking-wider', selected ? 'text-sage' : 'text-muted')}>
                {formatRelativeDay(d.date)}
              </span>
              <span className="font-display mt-0.5 text-lg leading-tight">{format(d.date, 'd')}</span>
              <span className={cn('text-[11px]', selected ? 'text-sage' : 'text-muted')}>
                {d.slots.length} slot{d.slots.length === 1 ? '' : 's'}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4" role="group" aria-label="Available times">
        {active?.slots.map((slot) => {
          const selected = slot.id === selectedSlotId;
          return (
            <button
              key={slot.id}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onSelectSlot(slot)}
              className={cn(
                'flex h-11 items-center justify-center gap-1.5 rounded-md border text-sm font-medium transition-[background-color,border-color,transform] focus-visible:outline-none focus-visible:shadow-[var(--shadow-ring)] active:scale-[0.98]',
                selected ? 'border-forest bg-forest text-white shadow-[0_1px_2px_rgba(23,63,50,0.3)]' : 'border-line bg-white text-ink hover:border-forest/50 hover:bg-mint',
              )}
            >
              {selected && (
                <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                  <path d="m5 10 3.5 3.5L15 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {formatTime(slot.startsAt)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
