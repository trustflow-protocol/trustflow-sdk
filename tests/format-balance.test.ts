import { formatBalance } from '../src/utils/format';
import { TrustFlowError } from '../src/errors';
import { TrustFlowClient } from '../src/client';

describe('formatBalance (#739)', () => {
  it('keeps full precision by default, so a few hundred stroops never read as zero', () => {
    expect(formatBalance('0.0000100')).toBe('0.00001');
    expect(formatBalance('0.0000001')).toBe('0.0000001');
    expect(formatBalance('12.3456789')).toBe('12.3456789');
  });

  it('still shows a truly empty balance as zero', () => {
    expect(formatBalance('0.0000000')).toBe('0');
    expect(formatBalance('0', { decimals: 2 })).toBe('0');
  });

  it('marks a nonzero balance below the display precision instead of rounding it to zero', () => {
    expect(formatBalance('0.0000100', { decimals: 2 })).toBe('< 0.01');
    expect(formatBalance('0.0000001', { decimals: 6 })).toBe('< 0.000001');
    expect(formatBalance('0.5', { decimals: 0 })).toBe('< 1');
    expect(formatBalance('-0.0000100', { decimals: 2 })).toBe('> -0.01');
  });

  it('truncates rather than rounds up, so a balance is never overstated', () => {
    expect(formatBalance('12.3499999', { decimals: 2 })).toBe('12.34');
    expect(formatBalance('0.9999999', { decimals: 2 })).toBe('0.99');
    expect(formatBalance('100.0000100', { decimals: 2 })).toBe('100');
  });

  it('rejects invalid amounts and out-of-range decimals', () => {
    expect(() => formatBalance('abc')).toThrow(TrustFlowError);
    expect(() => formatBalance('0.00000001')).toThrow(TrustFlowError);
    expect(() => formatBalance('1', { decimals: 8 })).toThrow(TrustFlowError);
    expect(() => formatBalance('1', { decimals: -1 })).toThrow(TrustFlowError);
    expect(() => formatBalance('1', { decimals: 1.5 })).toThrow(TrustFlowError);
  });

  it('getBalance returns a 100-stroop balance at full precision, not a zero string', async () => {
    const client = new TrustFlowClient({
      contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
    });
    jest.spyOn(client.getServer(), 'loadAccount').mockResolvedValue({
      balances: [{ asset_type: 'native', balance: '0.0000100' }],
    } as any);

    const balance = await client.getBalance(
      'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    );
    expect(balance).toBe('0.0000100');
    expect(formatBalance(balance, { decimals: 2 })).toBe('< 0.01');
  });
});
