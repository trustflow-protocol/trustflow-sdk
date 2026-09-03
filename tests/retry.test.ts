import { retry } from '../src/utils/retry';

describe('retry utility', () => {
  it('resolves on first attempt', async () => {
    const result = await retry(() => Promise.resolve(42), 3, 10);
    expect(result).toBe(42);
  });

  it('retries on failure and eventually resolves', async () => {
    let attempts = 0;
    const result = await retry(() => { attempts++; if (attempts < 3) throw new Error('fail'); return Promise.resolve('ok'); }, 5, 10);
    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('throws after all retries exhausted', async () => {
    await expect(retry(() => Promise.reject(new Error('always fail')), 3, 10)).rejects.toThrow('always fail');
  });

  it('supports RetryOptions configuration object and onRetry callback', async () => {
    let count = 0;
    const onRetryCalls: Array<{ attempt: number; error: unknown }> = [];
    const result = await retry(
      async (attempt) => {
        count++;
        if (attempt < 2) throw new Error(`error-${attempt}`);
        return 'success';
      },
      {
        attempts: 3,
        delayMs: 1,
        onRetry: (attempt, error) => onRetryCalls.push({ attempt, error }),
      },
    );

    expect(result).toBe('success');
    expect(count).toBe(2);
    expect(onRetryCalls.length).toBe(1);
    expect(onRetryCalls[0].attempt).toBe(1);
    expect((onRetryCalls[0].error as Error).message).toBe('error-1');
  });

  it('supports custom delay strategy function', async () => {
    const delayFn = jest.fn((attempt: number) => attempt * 2);
    let attempts = 0;

    const result = await retry(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error('delay-test');
        return 'done';
      },
      {
        attempts: 3,
        delayMs: delayFn,
      },
    );

    expect(result).toBe('done');
    expect(attempts).toBe(3);
    expect(delayFn).toHaveBeenCalledWith(1);
    expect(delayFn).toHaveBeenCalledWith(2);
  });
});
