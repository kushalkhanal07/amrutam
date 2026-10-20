import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { homeFor, useAuth } from '@/lib/auth/AuthContext';
import { cn } from '@/lib/utils/cn';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Logo } from '../ui/Logo';

const navItems = [
  { to: '/doctors', label: 'Find a doctor' },
  { to: '/#how-it-works', label: 'How it works' },
  { to: '/#specialties', label: 'Specialties' },
];

export function PublicLayout() {
  const { isAuthenticated, role } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <header className="sticky top-0 z-40 border-b border-line/80 bg-cream/85 backdrop-blur">
        <div className="container-x flex h-16 items-center justify-between gap-4">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn('rounded-md px-3 py-2 text-sm font-medium text-ink/80 transition-colors hover:bg-mint hover:text-ink', isActive && !item.to.includes('#') && 'text-forest')
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            {isAuthenticated ? (
              <Button variant="outline" onClick={() => navigate(homeFor(role))}>
                Go to dashboard
              </Button>
            ) : (
              <>
                <Link to="/login" className="rounded-md px-3 py-2 text-sm font-medium text-ink/80 hover:bg-mint hover:text-ink">
                  Sign in
                </Link>
                <Button onClick={() => navigate('/doctors')}>Book a consultation</Button>
              </>
            )}
          </div>
          <IconButton label={open ? 'Close menu' : 'Open menu'} className="md:hidden" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </IconButton>
        </div>
        {open && (
          <nav className="animate-fade border-t border-line bg-white px-4 py-4 md:hidden" aria-label="Mobile">
            <div className="flex flex-col gap-1">
              {navItems.map((item) => (
                <Link key={item.to} to={item.to} onClick={() => setOpen(false)} className="rounded-md px-3 py-2.5 text-[15px] font-medium text-ink hover:bg-mint">
                  {item.label}
                </Link>
              ))}
              <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
                {isAuthenticated ? (
                  <Button onClick={() => navigate(homeFor(role))} fullWidth>
                    Go to dashboard
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => navigate('/login')} fullWidth>
                      Sign in
                    </Button>
                    <Button onClick={() => navigate('/doctors')} fullWidth>
                      Book a consultation
                    </Button>
                  </>
                )}
              </div>
            </div>
          </nav>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-line bg-white">
        <div className="container-x grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
              Personalised Ayurvedic care, online. Discover verified doctors, book a consultation that fits your day, and keep your
              prescriptions in one calm place.
            </p>
          </div>
          <FooterColumn title="Patients" links={[['Find a doctor', '/doctors'], ['How it works', '/#how-it-works'], ['Create an account', '/register']]} />
          <FooterColumn title="Doctors" links={[['Join as a doctor', '/register?role=doctor'], ['Sign in', '/login']]} />
          <FooterColumn title="Platform" links={[['API documentation', 'http://localhost:3000/docs'], ['Status', 'http://localhost:3000/health']]} />
        </div>
        <div className="border-t border-line">
          <div className="container-x flex flex-col gap-2 py-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} Amrutam Telemedicine. Demo application: all doctors and content are sample data.</p>
            <p>Not for emergencies. If you need urgent help, contact local emergency services.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterColumn({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <ul className="mt-3 space-y-2">
        {links.map(([label, to]) => (
          <li key={label}>
            {to.startsWith('http') ? (
              <a href={to} target="_blank" rel="noreferrer" className="text-sm text-muted hover:text-forest">
                {label}
              </a>
            ) : (
              <Link to={to} className="text-sm text-muted hover:text-forest">
                {label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
