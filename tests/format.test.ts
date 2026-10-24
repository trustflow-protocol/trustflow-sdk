import { stroopsToXLM, truncateAddress, formatTimestamp } from '../src/utils/format';

describe('stroopsToXLM', () => {
  it('converts exactly 1 XLM', () => expect(stroopsToXLM(10_000_000n)).toBe('1'));
  it('converts 0.5 XLM', () => expect(stroopsToXLM(5_000_000n)).toBe('0.5'));
  it('handles zero', () => expect(stroopsToXLM(0n)).toBe('0'));
});

describe('truncateAddress', () => {
  const addr = 'GABC1234567890DEFGHIJKLMNOPQRSTUVWXYZ2345678901234567890ABCDE';
  it('truncates long address', () => expect(truncateAddress(addr)).toContain('...'));
  it('preserves short address', () => expect(truncateAddress('GABC')).toBe('GABC'));
  it('omits the suffix instead of appending the entire address when suffixLen is 0 (#629)', () => {
    const longAddr = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    expect(truncateAddress(longAddr, 10, 0)).toBe('GABCDEFGHI...');
  });
  it('omits the prefix when prefixLen is 0 and handles negative lengths safely (#629)', () => {
    const longAddr = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    expect(truncateAddress(longAddr, 0, 4)).toBe('...WXYZ');
    expect(truncateAddress(longAddr, 6, -2)).toBe('GABCDE...');
  });
});

describe('formatTimestamp', () => {
  it('formats to UTC string', () => {
    const ts = new Date('2026-04-01T12:00:00Z').getTime();
    expect(formatTimestamp(ts)).toContain('UTC');
  });
});
