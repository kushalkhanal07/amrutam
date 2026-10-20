import { Navigate, Outlet, useLocation } from 'react-router';
import type { Role } from '@/lib/api/types';
import { homeFor, useAuth } from '@/lib/auth/AuthContext';
import { Spinner } from '../ui/States';

export function ProtectedRoute({ roles }: { roles?: Role[] }) {
  const { isAuthenticated, isLoading, role } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream">
        <Spinner label="Checking your session" />
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (roles && role && !roles.includes(role)) {
    return <Navigate to={homeFor(role)} replace />;
  }
  return <Outlet />;
}
