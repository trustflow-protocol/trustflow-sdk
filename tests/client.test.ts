import { TrustFlowClient } from '../src/client';

describe('TrustFlowClient', () => {
  const client = new TrustFlowClient({ contractId: 'CTEST000000000000000000000000000000000000000000000000000000', network: 'TESTNET' });

  it('initialises with correct network', () => {
    expect(client.network).toBe('TESTNET');
  });

  it('stores contractId', () => {
    expect(client.contractId).toMatch(/^C/);
  });

  it('exposes Horizon server', () => {
    expect(client.getServer()).toBeDefined();
  });
});
