export interface RetryOptions {
  /** Total attempts including the first. */
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Decide whether an error is transient. Non-transient errors fail immediately. */
  shouldRetry?: (err: unknown) => boolean;
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
}

/** Exponential backoff with full jitter: delay = random(0, min(max, base * 2^attempt)). */
export function backoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
  return Math.floor(Math.random() * exp);
}

/**
 * Bounded retry for idempotent/transient operations only (network reads,
 * provider lookups, outbound notifications). Never wrap non-idempotent writes.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = options.attempts ?? 3;
  const base = options.baseDelayMs ?? 200;
  const max = options.maxDelayMs ?? 2000;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const retriable = options.shouldRetry ? options.shouldRetry(err) : true;
      if (!retriable || attempt === attempts - 1) {
        throw err;
      }
      const delay = backoffDelay(attempt, base, max);
      options.onRetry?.(err, attempt + 1, delay);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

/** Rejects if the promise does not settle within `ms`. Used for external calls. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = 'operation'): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
