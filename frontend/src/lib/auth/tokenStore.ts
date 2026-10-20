import type { Role, TokenPair } from '../api/types';

/**
 * Session persistence. The refresh token is long-lived and rotated by the backend
 * on every use; keeping it in localStorage lets the session survive reloads.
 * (A stricter deployment can move it to an HTTP-only cookie proxy.)
 */
const KEY = 'amrutam.session';

interface StoredSession {
  accessToken: string;
  refreshToken: string;
  role: Role;
}

let memory: StoredSession | null = null;
const listeners = new Set<() => void>();

function read(): StoredSession | null {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    memory = raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    memory = null;
  }
  return memory;
}

function notify() {
  listeners.forEach((l) => l());
}

export const tokenStore = {
  getAccessToken: () => read()?.accessToken ?? null,
  getRefreshToken: () => read()?.refreshToken ?? null,
  getRole: () => read()?.role ?? null,
  set(pair: TokenPair) {
    memory = { accessToken: pair.accessToken, refreshToken: pair.refreshToken, role: pair.role };
    try {
      localStorage.setItem(KEY, JSON.stringify(memory));
    } catch {
      /* private mode */
    }
    notify();
  },
  clear() {
    memory = null;
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    notify();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
