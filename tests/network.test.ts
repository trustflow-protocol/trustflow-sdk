import { getNetworkConfig } from '../src/stellar/network';

describe('Network configuration', () => {
  it('returns testnet config', () => {
    const cfg = getNetworkConfig('TESTNET');
    expect(cfg.horizonUrl).toContain('testnet');
    expect(cfg.passphrase).toContain('Test SDF');
  });

  it('returns mainnet config', () => {
    const cfg = getNetworkConfig('MAINNET');
    expect(cfg.horizonUrl).toBe('https://horizon.stellar.org');
    expect(cfg.passphrase).toContain('Public Global');
  });

  it('testnet and mainnet configs differ', () => {
    expect(getNetworkConfig('TESTNET').horizonUrl).not.toBe(getNetworkConfig('MAINNET').horizonUrl);
  });
});
