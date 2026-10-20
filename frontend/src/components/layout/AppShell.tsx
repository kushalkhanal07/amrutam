import { ChevronDown, LogOut, Menu, X, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth } from '@/lib/auth/AuthContext';
import { cn } from '@/lib/utils/cn';
import { fullName } from '@/lib/utils/format';
import { Avatar } from '../ui/Avatar';
import { IconButton } from '../ui/IconButton';
import { Logo } from '../ui/Logo';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

interface AppShellProps {
  items: NavItem[];
  areaLabel: string;
  /** Extra content rendered under the nav (e.g. a primary CTA). */
  sidebarExtra?: ReactNode;
}

/** Sidebar on desktop, drawer on mobile. Page title comes from the route handle via `useLocation` state or children. */
export function AppShell({ items, areaLabel, sidebarExtra }: AppShellProps) {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen bg-cream md:grid md:grid-cols-[260px_1fr]">
      {/* Desktop sidebar */}
      <aside className="hidden border-r border-line bg-white md:sticky md:top-0 md:flex md:h-screen md:flex-col">
        <SidebarContent items={items} areaLabel={areaLabel} extra={sidebarExtra} />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="animate-fade absolute inset-0 bg-forest-deep/40" onClick={() => setOpen(false)} aria-hidden />
          <aside className="animate-rise absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col bg-white shadow-[var(--shadow-lift)]">
            <div className="flex items-center justify-between px-4 pt-4">
              <Logo />
              <IconButton label="Close navigation" onClick={() => setOpen(false)}>
                <X className="size-5" />
              </IconButton>
            </div>
            <SidebarContent items={items} areaLabel={areaLabel} extra={sidebarExtra} hideLogo />
          </aside>
        </div>
      )}

      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line bg-cream/90 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <IconButton label="Open navigation" onClick={() => setOpen(true)}>
              <Menu className="size-5" />
            </IconButton>
            <Logo />
          </div>
          <p className="hidden text-sm font-medium text-muted md:block">{areaLabel}</p>
          <AccountMenu />
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="animate-rise mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function SidebarContent({ items, areaLabel, extra, hideLogo }: { items: NavItem[]; areaLabel: string; extra?: ReactNode; hideLogo?: boolean }) {
  return (
    <>
      {!hideLogo && (
        <div className="px-5 pt-5">
          <Logo />
        </div>
      )}
      <p className="px-5 pb-2 pt-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{areaLabel}</p>
      <nav className="flex-1 space-y-0.5 px-3" aria-label={areaLabel}>
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2.5 text-[15px] font-medium transition-colors',
                isActive ? 'bg-mint text-forest-deep' : 'text-ink/75 hover:bg-mint/60 hover:text-ink',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cn('size-[18px]', isActive ? 'text-forest' : 'text-muted')} aria-hidden />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      {extra && <div className="border-t border-line p-4">{extra}</div>}
    </>
  );
}

function AccountMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const name = fullName(user?.profile);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-mint focus-visible:outline-none focus-visible:shadow-[var(--shadow-ring)]"
      >
        <Avatar name={name} size="sm" />
        <span className="hidden max-w-[160px] truncate text-sm font-medium sm:block">{name}</span>
        <ChevronDown className="size-4 text-muted" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="animate-rise absolute right-0 mt-2 w-60 overflow-hidden rounded-lg border border-line bg-white shadow-[var(--shadow-lift)]">
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="truncate text-xs text-muted">{user?.email}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-forest">{user?.role.toLowerCase()}</p>
          </div>
          <Link to="/settings" role="menuitem" className="block px-4 py-2.5 text-sm hover:bg-mint" onClick={() => setOpen(false)}>
            Account settings
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-error hover:bg-error-soft"
          >
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
