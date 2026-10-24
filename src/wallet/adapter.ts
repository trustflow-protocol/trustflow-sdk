import { TransactionBuilder } from '@stellar/stellar-sdk';
import type { WalletAdapter } from './types';
import { getFreighter } from './freighter';
import { connectWallet, disconnectWallet } from './connect';
import { TrustFlowError } from '../errors';
import { NETWORK_CONFIGS, type StellarNetwork } from '../stellar/network';
import { verifySignedEnvelope, type SignableTransaction } from '../stellar/signing';

function resolveNetworkPassphrase(network: string): string {
  const upper = network.toUpperCase();
  const key = (upper === 'PUBLIC' ? 'MAINNET' : upper) as StellarNetwork;
  return NETWORK_CONFIGS[key]?.passphrase ?? network;
}

/**
 * Wraps the injected Freighter extension in the {@link WalletAdapter} interface (#435).
 *
 * The extension is looked up on every call rather than once up front, because
 * it can inject `window.freighter` after the adapter has been created.
 *
 * @returns A `WalletAdapter` for Freighter. Methods that need the extension throw
 *   `UNAUTHORIZED` when it is not installed; `isAvailable()` resolves `false` instead.
 *
 * @example
 * ```typescript
 * import { createFreighterAdapter } from '@trustflow/sdk/wallet';
 *
 * const adapter = createFreighterAdapter();
 * if (await adapter.isAvailable()) {
 *   const { publicKey } = await adapter.connect();
 * }
 * ```
 */
export function createFreighterAdapter(): WalletAdapter {
  const requireFreighter = () => {
    const freighter = getFreighter();
    if (!freighter) {
      throw new TrustFlowError('Freighter not installed', 'UNAUTHORIZED');
    }
    return freighter;
  };

  return {
    type: 'freighter',
    isAvailable: async () => getFreighter() !== null,
    connect: () => connectWallet('freighter'),
    sign: async (xdr, network) => {
      const freighter = requireFreighter();
      const passphrase = resolveNetworkPassphrase(network);
      let transaction: SignableTransaction;
      try {
        transaction = TransactionBuilder.fromXDR(xdr, passphrase);
      } catch (e) {
        throw TrustFlowError.signingFailed('invalid transaction envelope', e);
      }
      const { signedXDR } = await freighter.signTransaction(xdr, { network });
      return verifySignedEnvelope(transaction, signedXDR).xdr;
    },
    signMessage: async (message) => requireFreighter().signMessage(message),
    disconnect: () => disconnectWallet(),
  };
}
