import { inferNetworkFromRpcUrl, rpcUrlMatchesPassphrase, NETWORKS } from '../src/stellar/network';
import { TrustFlowClient } from '../src/client';

const CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

// ---------------------------------------------------------------------------
// inferNetworkFromRpcUrl
// ---------------------------------------------------------------------------

describe('inferNetworkFromRpcUrl', () => {
  it('identifies TESTNET from the canonical RPC URL', () => {
    const result = inferNetworkFromRpcUrl(NETWORKS.TESTNET.rpcUrl);
    expect(result).toBe(NETWORKS.TESTNET);
  });

  it('identifies MAINNET from the canonical RPC URL', () => {
    const result = inferNetworkFromRpcUrl(NETWORKS.MAINNET.rpcUrl);
    expect(result).toBe(NETWORKS.MAINNET);
  });

  it('returns undefined for an unknown / custom RPC URL', () => {
    expect(inferNetworkFromRpcUrl('https://my-private-rpc.example.com')).toBeUndefined();
  });

  it('returns undefined for a malformed URL', () => {
    expect(inferNetworkFromRpcUrl('not-a-url')).toBeUndefined();
  });

  it('matches on hostname only, ignoring path differences', () => {
    const url = new URL(NETWORKS.TESTNET.rpcUrl);
    url.pathname = '/some/other/path';
    const result = inferNetworkFromRpcUrl(url.toString());
    expect(result).toBe(NETWORKS.TESTNET);
  });
});

// ---------------------------------------------------------------------------
// rpcUrlMatchesPassphrase
// ---------------------------------------------------------------------------

describe('rpcUrlMatchesPassphrase', () => {
  it('returns true for a matching testnet URL and passphrase', () => {
    expect(
      rpcUrlMatchesPassphrase(NETWORKS.TESTNET.rpcUrl, NETWORKS.TESTNET.passphrase),
    ).toBe(true);
  });

  it('returns true for a matching mainnet URL and passphrase', () => {
    expect(
      rpcUrlMatchesPassphrase(NETWORKS.MAINNET.rpcUrl, NETWORKS.MAINNET.passphrase),
    ).toBe(true);
  });

  it('returns false when testnet URL is paired with mainnet passphrase', () => {
    expect(
      rpcUrlMatchesPassphrase(NETWORKS.TESTNET.rpcUrl, NETWORKS.MAINNET.passphrase),
    ).toBe(false);
  });

  it('returns false when mainnet URL is paired with testnet passphrase', () => {
    expect(
      rpcUrlMatchesPassphrase(NETWORKS.MAINNET.rpcUrl, NETWORKS.TESTNET.passphrase),
    ).toBe(false);
  });

  it('returns true (non-judgmental) for an unrecognised custom RPC URL', () => {
    expect(
      rpcUrlMatchesPassphrase('https://my-private-rpc.example.com', NETWORKS.MAINNET.passphrase),
    ).toBe(true);
  });

  it('returns true (non-judgmental) for a malformed URL', () => {
    expect(rpcUrlMatchesPassphrase('not-a-url', NETWORKS.TESTNET.passphrase)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TrustFlowClient constructor — mismatch warning
// ---------------------------------------------------------------------------

describe('TrustFlowClient constructor — rpcUrl/passphrase mismatch warning (#759)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Spy on the module-level logger used inside the client.
    // We import the logger lazily to ensure the spy is in place before the
    // constructor runs.
    const { logger } = require('../src/utils/logger');
    warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits a warning when testnet rpcUrl is paired with mainnet passphrase', () => {
    new TrustFlowClient({
      contractId: CONTRACT_ID,
      rpcUrl: NETWORKS.TESTNET.rpcUrl,
      networkPassphrase: NETWORKS.MAINNET.passphrase,
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('rpcUrl and networkPassphrase appear to target different networks'),
    );
  });

  it('emits a warning when mainnet rpcUrl is paired with testnet passphrase', () => {
    new TrustFlowClient({
      contractId: CONTRACT_ID,
      rpcUrl: NETWORKS.MAINNET.rpcUrl,
      networkPassphrase: NETWORKS.TESTNET.passphrase,
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('rpcUrl and networkPassphrase appear to target different networks'),
    );
  });

  it('does NOT warn when rpcUrl and passphrase match (testnet/testnet)', () => {
    new TrustFlowClient({
      contractId: CONTRACT_ID,
      rpcUrl: NETWORKS.TESTNET.rpcUrl,
      networkPassphrase: NETWORKS.TESTNET.passphrase,
    });

    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('rpcUrl and networkPassphrase appear to target different networks'),
    );
  });

  it('does NOT warn when only rpcUrl is supplied (passphrase defaults from network)', () => {
    new TrustFlowClient({
      contractId: CONTRACT_ID,
      rpcUrl: NETWORKS.TESTNET.rpcUrl,
    });

    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('rpcUrl and networkPassphrase appear to target different networks'),
    );
  });

  it('does NOT warn when only networkPassphrase is supplied (rpcUrl defaults from network)', () => {
    new TrustFlowClient({
      contractId: CONTRACT_ID,
      networkPassphrase: NETWORKS.TESTNET.passphrase,
    });

    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('rpcUrl and networkPassphrase appear to target different networks'),
    );
  });

  it('does NOT warn for a custom / unrecognised rpcUrl even with a known passphrase', () => {
    new TrustFlowClient({
      contractId: CONTRACT_ID,
      rpcUrl: 'https://my-private-rpc.example.com',
      networkPassphrase: NETWORKS.MAINNET.passphrase,
    });

    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('rpcUrl and networkPassphrase appear to target different networks'),
    );
  });

  it('warning message includes both the rpcUrl and networkPassphrase', () => {
    new TrustFlowClient({
      contractId: CONTRACT_ID,
      rpcUrl: NETWORKS.TESTNET.rpcUrl,
      networkPassphrase: NETWORKS.MAINNET.passphrase,
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(NETWORKS.TESTNET.rpcUrl),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(NETWORKS.MAINNET.passphrase),
    );
  });
});
