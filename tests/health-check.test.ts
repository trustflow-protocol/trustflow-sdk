import { TrustFlowClient } from '../src/client';

const CONTRACT_ID = 'C' + 'A'.repeat(55);

describe('TrustFlowClient.healthCheck (#809)', () => {
  it('returns ok: true and contractExists: true when RPC is healthy and contract ledger entry exists', async () => {
    const mockRpcServer = {
      getHealth: jest.fn().mockResolvedValue({ status: 'healthy' }),
      getLedgerEntries: jest.fn().mockResolvedValue({ entries: [{ key: 'mock' }] }),
    };
    const client = new TrustFlowClient({
      contractId: CONTRACT_ID,
      rpcServer: mockRpcServer as any,
    });

    const res = await client.healthCheck();
    expect(res.ok).toBe(true);
    expect(res.rpcReachable).toBe(true);
    expect(res.contractExists).toBe(true);
    expect(typeof res.latencyMs).toBe('number');
    expect(res.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('reports contractExists: false for a valid-but-nonexistent contract ID', async () => {
    const mockRpcServer = {
      getHealth: jest.fn().mockResolvedValue({ status: 'healthy' }),
      getLedgerEntries: jest.fn().mockResolvedValue({ entries: [] }),
    };
    const client = new TrustFlowClient({
      contractId: CONTRACT_ID,
      rpcServer: mockRpcServer as any,
    });

    const res = await client.healthCheck();
    expect(res.ok).toBe(false);
    expect(res.rpcReachable).toBe(true);
    expect(res.contractExists).toBe(false);
  });

  it('reports rpcReachable: false and ok: false when RPC is unreachable', async () => {
    const mockRpcServer = {
      getHealth: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      getLedgerEntries: jest.fn(),
    };
    const client = new TrustFlowClient({
      contractId: CONTRACT_ID,
      rpcServer: mockRpcServer as any,
    });

    const res = await client.healthCheck();
    expect(res.ok).toBe(false);
    expect(res.rpcReachable).toBe(false);
    expect(res.contractExists).toBe(false);
  });
});
