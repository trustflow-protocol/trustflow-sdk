import { TrustFlowError } from '../errors';

export type DelayStrategy = number | ((attempt: number) => number);

export interface RetryOptions {
  /** Maximum number of execution attempts */
  attempts: number;
  /** Fixed delay in ms (multiplied linearly by attempt) or a custom delay strategy function */
  delayMs?: DelayStrategy;
  /** Optional callback invoked after a failed attempt */
  onRetry?: (attempt: number, error: unknown) => void;
}

/**
 * Generic retry helper with customizable backoff strategies and per-attempt callbacks.
 *
 * @param fn Function to execute, receiving the current 1-indexed attempt number
 * @param attemptsOrOptions Total attempts (number) or a `RetryOptions` configuration object
 * @param delayMs Optional delay in ms (number for linear scaling) or a delay strategy function
 */
export async function retry<T>(
  fn: (attempt: number) => Promise<T>,
  attemptsOrOptions: number | RetryOptions,
  delayMs?: DelayStrategy,
): Promise<T> {
  let attempts: number;
  let delayStrategy: (attempt: number) => number;
  let onRetry: ((attempt: number, error: unknown) => void) | undefined;

  if (typeof attemptsOrOptions === 'object') {
    attempts = attemptsOrOptions.attempts;
    const d = attemptsOrOptions.delayMs ?? 0;
    delayStrategy = typeof d === 'function' ? d : (attempt: number) => d * attempt;
    onRetry = attemptsOrOptions.onRetry;
  } else {
    attempts = attemptsOrOptions;
    const d = delayMs ?? 0;
    delayStrategy = typeof d === 'function' ? d : (attempt: number) => d * attempt;
  }

  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      lastErr = e;
      if (onRetry) {
        onRetry(attempt, e);
      }
      if (attempt < attempts) {
        const delay = delayStrategy(attempt);
        if (delay > 0) {
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
  }

  throw (
    lastErr ??
    new TrustFlowError('Retry failed', 'RETRY_EXHAUSTED')
  );
}
