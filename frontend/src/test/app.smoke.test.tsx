/**
 * End-to-end smoke test against a RUNNING backend (seeded). Skipped unless
 * SMOKE=1 is set, so the normal unit test run stays hermetic.
 *
 *   SMOKE=1 VITE_API_URL=http://localhost:3000 npx vitest run src/test/app.smoke.test.tsx
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import App from '../App';
import { ToastProvider } from '../components/ui/Toast';
import { AuthProvider } from '../lib/auth/AuthContext';
import { tokenStore } from '../lib/auth/tokenStore';

const SMOKE = process.env.SMOKE === '1';

function renderApp(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe.skipIf(!SMOKE)('app smoke (live backend)', () => {
  it('lists seeded doctors in the directory', async () => {
    tokenStore.clear();
    renderApp('/doctors');
    await waitFor(() => expect(screen.getAllByText(/View profile/i).length).toBeGreaterThan(0), { timeout: 15000 });
    expect(screen.getByText(/doctors? found/i)).toBeInTheDocument();
  });

  it('logs the seeded patient in and shows the dashboard', async () => {
    tokenStore.clear();
    const user = userEvent.setup();
    renderApp('/login');
    await user.type(await screen.findByLabelText(/email/i), 'patient@amrutam.local');
    await user.type(screen.getByLabelText(/^password/i), 'Password123!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(screen.getByText(/Here is what is coming up/i)).toBeInTheDocument(), { timeout: 15000 });
    expect(screen.getAllByText(/Patient portal/i).length).toBeGreaterThan(0);
  });

  it('shows the doctor workspace for a seeded doctor', async () => {
    tokenStore.clear();
    const user = userEvent.setup();
    renderApp('/login');
    await user.type(await screen.findByLabelText(/email/i), 'dr.meera@amrutam.local');
    await user.type(screen.getByLabelText(/^password/i), 'Password123!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(screen.getByText(/Today's schedule/i)).toBeInTheDocument(), { timeout: 15000 });
  });

  it('shows admin analytics for the seeded admin', async () => {
    tokenStore.clear();
    const user = userEvent.setup();
    renderApp('/login');
    await user.type(await screen.findByLabelText(/email/i), 'admin@amrutam.local');
    await user.type(screen.getByLabelText(/^password/i), 'Password123!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(screen.getByText(/Consultations by status/i)).toBeInTheDocument(), { timeout: 15000 });
    await waitFor(() => expect(screen.getByText(/Doctor utilization/i)).toBeInTheDocument());
  });
});
