export interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  backoff?: 'linear' | 'exponential';
  onRetry?: (attempt: number, error: unknown) => void;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { maxAttempts = 3, delayMs = 500, backoff = 'exponential', onRetry } = opts;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try { return await fn(); }
    catch (e) {
      lastError = e;
      if (attempt < maxAttempts) {
        onRetry?.(attempt, e);
        const wait = backoff === 'exponential' ? delayMs * 2 ** (attempt - 1) : delayMs * attempt;
        await new Promise(r => setTimeout(r, wait));
      }
    }
  }
  throw lastError;
}
