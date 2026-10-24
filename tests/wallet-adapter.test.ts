import {
  Account,
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { createFreighterAdapter } from '../src/wallet/adapter';
import type { WalletAdapter } from '../src/wallet/types';
import { MockWalletAdapter } from '../src/testing';
import { TrustFlowError } from '../src/errors';

const PUBLIC_KEY = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const CONTRACT_ID = 'CCJZ5DGASBWQXR5MPFCJXMBI333XE5U3FSJTNQU7RIKE3P5GN2K2WYD5';

function buildUnsignedAndSignedXdr(sequence = '100'): { unsignedXdr: string; signedXdr: string } {
  const signer = Keypair.random();
  const tx = new TransactionBuilder(new Account(signer.publicKey(), sequence), {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(new Contract(CONTRACT_ID).call('increment'))
    .setTimeout(30)
    .build();
  const unsignedXdr = tx.toEnvelope().toXDR('base64');
  const signedCopy = TransactionBuilder.fromXDR(unsignedXdr, Networks.TESTNET);
  signedCopy.sign(signer);
  return { unsignedXdr, signedXdr: signedCopy.toEnvelope().toXDR('base64') };
}

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

  it('delegates connect, sign and signMessage to the injected extension and verifies signed XDR (#611)', async () => {
    const { unsignedXdr, signedXdr } = buildUnsignedAndSignedXdr();
    const signTransaction = jest.fn().mockResolvedValue({ signedXDR: signedXdr });
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
    await expect(adapter.sign(unsignedXdr, 'TESTNET')).resolves.toBe(signedXdr);
    expect(signTransaction).toHaveBeenCalledWith(unsignedXdr, { network: 'TESTNET' });
    await expect(adapter.signMessage('hello')).resolves.toBe('sig');
  });

  it('rejects unverified, unsigned, or mismatched envelopes returned by the wallet (#611)', async () => {
    const { unsignedXdr } = buildUnsignedAndSignedXdr('100');
    const { signedXdr: otherSignedXdr } = buildUnsignedAndSignedXdr('200');
    const adapter = createFreighterAdapter();

    // 1. Wallet returns the original unsigned envelope with no added signature
    installFreighter({
      signTransaction: jest.fn().mockResolvedValue({ signedXDR: unsignedXdr }),
    });
    await expect(adapter.sign(unsignedXdr, 'TESTNET')).rejects.toMatchObject({
      code: 'SIGNING_ERROR',
      message: expect.stringContaining('did not add a signature'),
    });

    // 2. Wallet returns a signed envelope for a different transaction
    installFreighter({
      signTransaction: jest.fn().mockResolvedValue({ signedXDR: otherSignedXdr }),
    });
    await expect(adapter.sign(unsignedXdr, 'TESTNET')).rejects.toMatchObject({
      code: 'SIGNING_ERROR',
      message: expect.stringContaining('different transaction'),
    });

    // 3. Wallet returns malformed XDR
    installFreighter({
      signTransaction: jest.fn().mockResolvedValue({ signedXDR: 'not-valid-xdr' }),
    });
    await expect(adapter.sign(unsignedXdr, 'TESTNET')).rejects.toMatchObject({
      code: 'SIGNING_ERROR',
      message: expect.stringContaining('invalid transaction envelope'),
    });
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
