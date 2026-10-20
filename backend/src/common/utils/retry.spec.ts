import { backoffDelay, withRetry, withTimeout } from './retry';

describe('withRetry', () => {
  it('returns the first successful result', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    await expect(withRetry(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries transient failures up to the attempt limit', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('a'))
      .mockRejectedValueOnce(new Error('b'))
      .mockResolvedValue('ok');
    const onRetry = jest.fn();
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 1, maxDelayMs: 2, onRetry })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('gives up after the last attempt', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('down'));
    await expect(withRetry(fn, { attempts: 2, baseDelayMs: 1, maxDelayMs: 1 })).rejects.toThrow('down');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-transient errors', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('bad request'));
    await expect(withRetry(fn, { attempts: 5, shouldRetry: () => false })).rejects.toThrow('bad request');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('backoffDelay', () => {
  it('is bounded by the max delay and grows with the attempt number', () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const d = backoffDelay(attempt, 100, 1000);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(1000);
    }
  });
});

describe('withTimeout', () => {
  it('rejects when the promise is too slow', async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 200));
    await expect(withTimeout(slow, 10, 'slow call')).rejects.toThrow('slow call timed out after 10ms');
  });

  it('resolves fast promises', async () => {
    await expect(withTimeout(Promise.resolve(1), 100)).resolves.toBe(1);
  });
});
