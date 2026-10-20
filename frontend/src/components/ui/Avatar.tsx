import { cn } from '@/lib/utils/cn';
import { initials } from '@/lib/utils/format';

const palette = ['bg-sage text-forest-deep', 'bg-[#e8dcc9] text-[#6b4f1d]', 'bg-[#d9e6ec] text-[#2e4e5c]', 'bg-[#ecdede] text-[#6a3434]'];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Tasteful initials avatar; doctor portraits are not supplied by the API. */
export function Avatar({ name, size = 'md', className }: { name: string; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  const sizes = { sm: 'size-8 text-xs', md: 'size-11 text-sm', lg: 'size-16 text-lg', xl: 'size-24 text-2xl' };
  return (
    <div
      aria-hidden
      className={cn('flex shrink-0 items-center justify-center rounded-full font-display font-semibold tracking-wide', palette[hash(name) % palette.length], sizes[size], className)}
    >
      {initials(name) || '·'}
    </div>
  );
}
