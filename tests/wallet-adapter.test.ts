import { createFreighterAdapter } from '../src/wallet/adapter';
import type { WalletAdapter } from '../src/wallet/types';
import { MockWalletAdapter } from '../src/testing';
import { TrustFlowError } from '../src/errors';

const PUBLIC_KEY = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

function installFreighter(provider: Record<string, unknown>): void {
  (globalThis as any).window = { freighter: provider };
}

afterEach(() => {
  delete (globalThis as any).window;
});

describe('createFreighterAdapter (#435)', () => {
  it('satisfies the WalletAdapter interface', () => {
    const adapter: WalletAdapter = createFreighterAdapter();
    expect(adapter.type).toBe('freighter');
  });

  it('reports unavailable and throws UNAUTHORIZED when Freighter is not installed', async () => {
    const adapter = createFreighterAdapter();

    await expect(adapter.isAvailable()).resolves.toBe(false);
    await expect(adapter.sign('xdr', 'TESTNET')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(adapter.signMessage('hello')).rejects.toBeInstanceOf(TrustFlowError);
  });

  it('delegates connect, sign and signMessage to the injected extension', async () => {
    const signTransaction = jest.fn().mockResolvedValue({ signedXDR: 'signed_xdr' });
    installFreighter({
      getPublicKey: jest.fn().mockResolvedValue(PUBLIC_KEY),
      getNetwork: jest.fn().mockResolvedValue('TESTNET'),
      signTransaction,
      signMessage: jest.fn().mockResolvedValue('sig'),
    });
    const adapter = createFreighterAdapter();

    await expect(adapter.isAvailable()).resolves.toBe(true);
    await expect(adapter.connect()).resolves.toEqual({
      type: 'freighter',
      publicKey: PUBLIC_KEY,
      network: 'TESTNET',
    });
    await expect(adapter.sign('xdr', 'TESTNET')).resolves.toBe('signed_xdr');
    expect(signTransaction).toHaveBeenCalledWith('xdr', { network: 'TESTNET' });
    await expect(adapter.signMessage('hello')).resolves.toBe('sig');
  });

  it('wraps user rejections and wallet errors from sign and signMessage as TrustFlowError (#601)', async () => {
    const rejection = new Error('User declined access');
    installFreighter({
      getPublicKey: jest.fn().mockResolvedValue(PUBLIC_KEY),
      getNetwork: jest.fn().mockResolvedValue('TESTNET'),
      signTransaction: jest.fn().mockRejectedValue(rejection),
      signMessage: jest.fn().mockRejectedValue({ code: 4001, message: 'User rejected request' }),
    });
    const adapter = createFreighterAdapter();

    const signErr = await adapter.sign('xdr', 'TESTNET').catch((e) => e);
    expect(signErr).toBeInstanceOf(TrustFlowError);
    expect(signErr.code).toBe('USER_REJECTED');
    expect(signErr.cause).toBe(rejection);

    const msgErr = await adapter.signMessage('hello').catch((e) => e);
    expect(msgErr).toBeInstanceOf(TrustFlowError);
    expect(msgErr.code).toBe('USER_REJECTED');

    const genericErr = new Error('Extension crashed');
    installFreighter({
      getPublicKey: jest.fn().mockResolvedValue(PUBLIC_KEY),
      getNetwork: jest.fn().mockResolvedValue('TESTNET'),
      signTransaction: jest.fn().mockRejectedValue(genericErr),
      signMessage: jest.fn().mockRejectedValue('raw failure'),
    });

    const signGeneric = await adapter.sign('xdr', 'TESTNET').catch((e) => e);
    expect(signGeneric).toBeInstanceOf(TrustFlowError);
    expect(signGeneric.code).toBe('SIGNING_ERROR');
    expect(signGeneric.cause).toBe(genericErr);

    const msgGeneric = await adapter.signMessage('hello').catch((e) => e);
    expect(msgGeneric).toBeInstanceOf(TrustFlowError);
    expect(msgGeneric.code).toBe('SIGNING_ERROR');
  });
});

describe('MockWalletAdapter.asWalletAdapter (#435)', () => {
  it('exposes the mock through the WalletAdapter interface and shares its state', async () => {
    const mock = new MockWalletAdapter(PUBLIC_KEY);
    const adapter: WalletAdapter = mock.asWalletAdapter();

    await expect(adapter.isAvailable()).resolves.toBe(true);
    await expect(adapter.connect()).resolves.toEqual({
      type: 'freighter',
      publicKey: PUBLIC_KEY,
      network: 'TESTNET',
    });
    await expect(adapter.sign('xdr', 'TESTNET')).resolves.toBe('xdr');
    await expect(adapter.signMessage('hi')).resolves.toBe('mock_sig_hi');

    await adapter.disconnect();
    await expect(adapter.isAvailable()).resolves.toBe(false);
    expect(mock.connected).toBe(false);
  });
});
