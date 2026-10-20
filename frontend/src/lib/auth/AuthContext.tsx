import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi, usersApi } from '../api/endpoints';
import type { Role, TokenPair, User } from '../api/types';
import { tokenStore } from './tokenStore';

interface AuthContextValue {
  user: User | null;
  role: Role | null;
  isAuthenticated: boolean;
  /** True while the stored session is being validated on first load. */
  isLoading: boolean;
  login: (pair: TokenPair) => void;
  logout: () => Promise<void>;
  refetchUser: () => Promise<unknown>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [hasSession, setHasSession] = useState<boolean>(() => Boolean(tokenStore.getRefreshToken()));

  useEffect(() => tokenStore.subscribe(() => setHasSession(Boolean(tokenStore.getRefreshToken()))), []);

  const userQuery = useQuery({
    queryKey: ['me'],
    queryFn: usersApi.me,
    enabled: hasSession,
    staleTime: 60_000,
    retry: false,
  });

  useEffect(() => {
    // Session rejected by the server (expired/revoked): drop it locally.
    if (userQuery.isError && hasSession) {
      tokenStore.clear();
      queryClient.removeQueries({ queryKey: ['me'] });
    }
  }, [userQuery.isError, hasSession, queryClient]);

  const login = useCallback(
    (pair: TokenPair) => {
      tokenStore.set(pair);
      void queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    const refreshToken = tokenStore.getRefreshToken();
    try {
      if (refreshToken) await authApi.logout(refreshToken);
    } catch {
      /* already invalid */
    } finally {
      tokenStore.clear();
      queryClient.clear();
    }
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: hasSession ? (userQuery.data ?? null) : null,
      role: hasSession ? (userQuery.data?.role ?? tokenStore.getRole()) : null,
      isAuthenticated: hasSession && Boolean(userQuery.data),
      isLoading: hasSession && userQuery.isPending,
      login,
      logout,
      refetchUser: userQuery.refetch,
    }),
    [hasSession, userQuery.data, userQuery.isPending, userQuery.refetch, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Where each role lands after login. */
export function homeFor(role: Role | null): string {
  switch (role) {
    case 'DOCTOR':
      return '/doctor';
    case 'ADMIN':
      return '/admin';
    case 'PATIENT':
      return '/app';
    default:
      return '/';
  }
}
