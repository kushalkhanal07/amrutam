import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Slot } from '@/lib/api/types';
import { SlotPicker, groupSlotsByDay } from './SlotPicker';

const day1 = new Date('2030-01-10T09:00:00.000Z');
const slots: Slot[] = [
  { id: 'b', startsAt: new Date(day1.getTime() + 30 * 60_000).toISOString(), endsAt: new Date(day1.getTime() + 60 * 60_000).toISOString(), status: 'AVAILABLE' },
  { id: 'a', startsAt: day1.toISOString(), endsAt: new Date(day1.getTime() + 30 * 60_000).toISOString(), status: 'AVAILABLE' },
  { id: 'c', startsAt: new Date(day1.getTime() + 2 * 86_400_000).toISOString(), endsAt: new Date(day1.getTime() + 2 * 86_400_000 + 30 * 60_000).toISOString(), status: 'AVAILABLE' },
];

describe('groupSlotsByDay', () => {
  it('groups by local day and sorts within the day', () => {
    const days = groupSlotsByDay(slots);
    expect(days).toHaveLength(2);
    expect(days[0].slots.map((s) => s.id)).toEqual(['a', 'b']);
    expect(days[1].slots.map((s) => s.id)).toEqual(['c']);
  });
});

describe('SlotPicker', () => {
  it('shows the first day by default and reports selections', () => {
    const onSelectSlot = vi.fn();
    render(<SlotPicker slots={slots} selectedDay={null} selectedSlotId={null} onSelectDay={() => undefined} onSelectSlot={onSelectSlot} />);
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    const times = screen.getAllByRole('button', { pressed: false });
    expect(times).toHaveLength(2);
    fireEvent.click(times[0]);
    expect(onSelectSlot).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('marks the selected slot with aria-pressed', () => {
    render(<SlotPicker slots={slots} selectedDay={null} selectedSlotId="b" onSelectDay={() => undefined} onSelectSlot={() => undefined} />);
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1);
  });

  it('renders an empty state without slots', () => {
    render(<SlotPicker slots={[]} selectedDay={null} selectedSlotId={null} onSelectDay={() => undefined} onSelectSlot={() => undefined} />);
    expect(screen.getByText(/No open slots/)).toBeInTheDocument();
  });
});
