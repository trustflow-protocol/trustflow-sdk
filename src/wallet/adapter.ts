import type { WalletAdapter } from './types';
import { isWalletRejection } from './types';
import { getFreighter } from './freighter';
import { connectWallet, disconnectWallet } from './connect';
import { TrustFlowError } from '../errors';
import type { Network } from '../types';
import { NETWORK_CONFIGS } from '../stellar/network';

/** Options for {@link createFreighterAdapter}. */
export interface FreighterAdapterOptions {
  /**
   * The network your app (e.g. its `TrustFlowClient`) is configured for. When
   * set, `sign()` refuses — before the wallet is ever prompted — to sign for any
   * other network (#738). Pass `client.network`.
   */
  network?: Network;
}

/** Wallets and callers name the public network `PUBLIC`/`PUBNET`; the SDK calls it `MAINNET`. */
function normalizeNetwork(name: string): string {
  const upper = name.trim().toUpperCase();
  return upper === 'PUBLIC' || upper === 'PUBNET' ? 'MAINNET' : upper;
}

/**
 * Wraps the injected Freighter extension in the {@link WalletAdapter} interface (#435).
 *
 * The extension is looked up on every call rather than once up front, because
 * it can inject `window.freighter` after the adapter has been created.
 *
 * A raw unsigned XDR does not carry its network passphrase (the passphrase only
 * feeds the transaction hash), so the SDK cannot read the network back out of
 * it. Instead `sign()` cross-checks every source of truth it has before the
 * wallet is prompted: the `network` argument must be a known network, must
 * match `options.network` when one is configured, and must match the network
 * Freighter is currently on. Any mismatch throws `SIGNING_ERROR` without
 * showing a sign prompt (#738). For a full passphrase check, sign a
 * `Transaction` object with `signWithFreighter` instead.
 *
 * @param options - `network` the app is configured for (e.g. `client.network`)
 * @returns A `WalletAdapter` for Freighter. Methods that need the extension throw
 *   `UNAUTHORIZED` when it is not installed; `isAvailable()` resolves `false` instead.
 *
 * @example
 * ```typescript
 * import { createFreighterAdapter } from '@trustflow/sdk/wallet';
 *
 * const adapter = createFreighterAdapter({ network: client.network });
 * if (await adapter.isAvailable()) {
 *   const { publicKey } = await adapter.connect();
 * }
 * ```
 */
export function createFreighterAdapter(options: FreighterAdapterOptions = {}): WalletAdapter {
  if (options.network !== undefined && !NETWORK_CONFIGS[options.network]) {
    throw new TrustFlowError(`Unsupported network: ${String(options.network)}`, 'INVALID_CONFIG');
  }

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
      try {
        const freighter = requireFreighter();
        const requested = normalizeNetwork(network);
        if (!(requested in NETWORK_CONFIGS)) {
          throw TrustFlowError.signingFailed(`unknown network "${network}"`);
        }
        if (options.network && requested !== options.network) {
          throw TrustFlowError.signingFailed(
            `refusing to sign for ${requested}: this adapter is configured for ${options.network}`,
          );
        }
        const walletNetwork = await freighter.getNetwork();
        if (walletNetwork && normalizeNetwork(walletNetwork) !== requested) {
          throw TrustFlowError.signingFailed(
            `refusing to sign for ${requested}: wallet is on ${walletNetwork}`,
          );
        }
        const { signedXDR } = await freighter.signTransaction(xdr, { network });
        return signedXDR;
      } catch (e: unknown) {
        if (e instanceof TrustFlowError) throw e;
        if (isWalletRejection(e)) {
          throw TrustFlowError.userRejected(
            e instanceof Error ? e.message : 'User rejected Freighter signing',
            e,
          );
        }
        throw TrustFlowError.signingFailed(e instanceof Error ? e.message : String(e), e);
      }
    },
    signMessage: async (message) => {
      try {
        return await requireFreighter().signMessage(message);
      } catch (e: unknown) {
        if (e instanceof TrustFlowError) throw e;
        if (isWalletRejection(e)) {
          throw TrustFlowError.userRejected(
            e instanceof Error ? e.message : 'User rejected Freighter signing',
            e,
          );
        }
        throw TrustFlowError.signingFailed(e instanceof Error ? e.message : String(e), e);
      }
    },
    disconnect: () => disconnectWallet(),
  };
}
