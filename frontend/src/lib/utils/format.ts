import { format, formatDistanceToNowStrict, isToday, isTomorrow } from 'date-fns';

/** Money is stored as integer minor units + ISO currency on the backend. */
export function formatMoney(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(
      amountMinor / 100,
    );
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
  }
}

export function formatDate(iso: string | Date): string {
  return format(new Date(iso), 'EEE, d MMM yyyy');
}

export function formatTime(iso: string | Date): string {
  return format(new Date(iso), 'h:mm a');
}

export function formatDateTime(iso: string | Date): string {
  return format(new Date(iso), 'EEE, d MMM yyyy · h:mm a');
}

export function formatTimestamp(iso: string | Date): string {
  return format(new Date(iso), 'd MMM yyyy, HH:mm:ss');
}

export function formatRelativeDay(iso: string | Date): string {
  const d = new Date(iso);
  if (isToday(d)) return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  return format(d, 'EEE, d MMM');
}

export function formatCountdown(iso: string | Date): string {
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
}

export function fullName(profile?: { firstName?: string; lastName?: string } | null): string {
  if (!profile) return 'Unknown';
  return [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Unknown';
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function humanizeStatus(status: string): string {
  return status
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
