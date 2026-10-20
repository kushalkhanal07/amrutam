import { tokenStore } from '../auth/tokenStore';
import type { ApiError, TokenPair } from './types';

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:3000';

export class HttpError extends Error {
  readonly status: number;
  readonly body: ApiError | null;

  constructor(status: number, body: ApiError | null, fallback: string) {
    super(HttpError.messageOf(body) ?? fallback);
    this.status = status;
    this.body = body;
  }

  static messageOf(body: ApiError | null): string | undefined {
    if (!body) return undefined;
    return Array.isArray(body.message) ? body.message.join('. ') : body.message;
  }

  get messages(): string[] {
    if (!this.body) return [this.message];
    return Array.isArray(this.body.message) ? this.body.message : [this.body.message];
  }
}

export function isHttpError(err: unknown, status?: number): err is HttpError {
  return err instanceof HttpError && (status === undefined || err.status === status);
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  /** Skip the Authorization header (public endpoints). */
  anonymous?: boolean;
  signal?: AbortSignal;
}

let refreshInFlight: Promise<boolean> | null = null;

/** Rotates the refresh token once even if several requests fail at the same time. */
async function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const refreshToken = tokenStore.getRefreshToken();
      if (!refreshToken) return false;
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) {
          tokenStore.clear();
          return false;
        }
        const pair = (await res.json()) as TokenPair;
        tokenStore.set(pair);
        return true;
      } catch {
        return false;
      } finally {
        setTimeout(() => {
          refreshInFlight = null;
        }, 0);
      }
    })();
  }
  return refreshInFlight;
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined;
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function request<T>(path: string, options: RequestOptions = {}, retried = false): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const access = tokenStore.getAccessToken();
  if (!options.anonymous && access) headers.Authorization = `Bearer ${access}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new HttpError(0, null, 'Cannot reach the server. Check your connection and try again.');
  }

  if (res.status === 401 && !options.anonymous && !retried && tokenStore.getRefreshToken()) {
    const ok = await refreshSession();
    if (ok) return request<T>(path, options, true);
  }

  const body = await parseBody(res);
  if (!res.ok) {
    const apiBody = typeof body === 'object' && body !== null && 'statusCode' in body ? (body as ApiError) : null;
    throw new HttpError(res.status, apiBody, `Request failed (${res.status})`);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) => request<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'PATCH', body }),
  delete: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'DELETE' }),
};

/** Builds a query string, skipping empty values. */
export function qs(params: object): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    search.set(k, String(v as string | number | boolean));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}
