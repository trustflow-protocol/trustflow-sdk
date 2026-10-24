import { CircuitBreaker, CircuitBreakerRegistry } from '../src/utils/circuit-breaker';
import { TrustFlowError } from '../src/errors';

describe('CircuitBreaker', () => {
  it('opens after failureThreshold consecutive failures and rejects while OPEN', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      resetTimeoutMs: 60_000,
      successThreshold: 2,
    });

    await expect(breaker.execute(async () => {
      throw new Error('fail 1');
    })).rejects.toThrow('fail 1');
    expect(breaker.getState()).toBe('CLOSED');

    await expect(breaker.execute(async () => {
      throw new Error('fail 2');
    })).rejects.toThrow('fail 2');
    expect(breaker.getState()).toBe('OPEN');

    await expect(breaker.execute(async () => 'ok')).rejects.toThrow(TrustFlowError);
  });

  it('resets successCount when a HALF_OPEN probe fails so a later HALF_OPEN cycle requires the full successThreshold (#626)', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 0,
      successThreshold: 3,
    });

    // Trip CLOSED -> OPEN
    await expect(
      breaker.execute(async () => {
        throw new Error('initial failure');
      }),
    ).rejects.toThrow('initial failure');

    // Cycle 1: 1 success in HALF_OPEN, then 1 failure re-opens the circuit
    await expect(breaker.execute(async () => 'ok-1')).resolves.toBe('ok-1');
    expect(breaker.getDiagnostics().successCount).toBe(1);

    await expect(
      breaker.execute(async () => {
        throw new Error('probe failure');
      }),
    ).rejects.toThrow('probe failure');

    // successCount must be reset to 0 when HALF_OPEN fails back to OPEN
    expect(breaker.getDiagnostics().state).toBe('OPEN');
    expect(breaker.getDiagnostics().successCount).toBe(0);

    // Cycle 2: requires all 3 consecutive successes before closing
    await expect(breaker.execute(async () => 'ok-2a')).resolves.toBe('ok-2a');
    expect(breaker.getDiagnostics().state).toBe('HALF_OPEN');
    expect(breaker.getDiagnostics().successCount).toBe(1);

    await expect(breaker.execute(async () => 'ok-2b')).resolves.toBe('ok-2b');
    expect(breaker.getDiagnostics().state).toBe('HALF_OPEN');
    expect(breaker.getDiagnostics().successCount).toBe(2);

    await expect(breaker.execute(async () => 'ok-2c')).resolves.toBe('ok-2c');
    expect(breaker.getDiagnostics().state).toBe('CLOSED');
    expect(breaker.getDiagnostics().successCount).toBe(0);
  });

  it('resets successCount on executeSync HALF_OPEN failure as well (#626)', () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 0,
      successThreshold: 2,
    });

    expect(() =>
      breaker.executeSync(() => {
        throw new Error('boom');
      }),
    ).toThrow('boom');

    // 1st probe succeeds, 2nd probe fails
    expect(breaker.executeSync(() => 'ok')).toBe('ok');
    expect(breaker.getDiagnostics().successCount).toBe(1);

    expect(() =>
      breaker.executeSync(() => {
        throw new Error('probe boom');
      }),
    ).toThrow('probe boom');
    expect(breaker.getDiagnostics().successCount).toBe(0);

    // Next cycle must still require 2 consecutive successes to close
    expect(breaker.executeSync(() => 'ok-1')).toBe('ok-1');
    expect(breaker.getDiagnostics().state).toBe('HALF_OPEN');
    expect(breaker.executeSync(() => 'ok-2')).toBe('ok-2');
    expect(breaker.getDiagnostics().state).toBe('CLOSED');
  });

  it('manages named breakers via CircuitBreakerRegistry', () => {
    const registry = new CircuitBreakerRegistry();
    const b1 = registry.get('horizon', { failureThreshold: 3 });
    expect(registry.get('horizon')).toBe(b1);
    expect(registry.getAll().size).toBe(1);
    registry.resetAll();
    registry.remove('horizon');
    expect(registry.getAll().size).toBe(0);
  });
});
