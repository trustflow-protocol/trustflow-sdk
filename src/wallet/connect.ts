import type { WalletConnection, WalletType } from './types';
import { isWalletRejection } from './types';
import { getFreighter } from './freighter';
import { getAlbedo } from './albedo';
import { TrustFlowError } from '../errors';

/** Wallets may name the public network `public` or `pubnet`; the SDK calls it `MAINNET`. */
function normalizeWalletNetwork(name: string): string {
  const upper = name.toUpperCase();
  return upper === 'PUBLIC' || upper === 'PUBNET' ? 'MAINNET' : upper;
}

/**
 * Connection attempts that have not settled yet, keyed by wallet type. Several
 * components mounting at once and each calling `connectWallet()` share the one
 * attempt instead of each opening its own wallet prompt (#741).
 */
const inFlightConnections = new Map<WalletType, Promise<WalletConnection>>();

/**
 * Attempts to establish a connection with the specified Stellar wallet.
 * If the user rejects the connection dialog, a retryable TrustFlowError with
 * code 'USER_REJECTED' is thrown, leaving the connection state clean for subsequent attempts.
 *
 * Calls made while a connection to the same wallet type is still pending get
 * that pending attempt's promise, so the wallet prompts only once and every
 * caller sees the same result or error. Once the attempt settles, the next call
 * starts a new one, so a retry after a rejection prompts again.
 */
export function connectWallet(type: WalletType = 'freighter'): Promise<WalletConnection> {
  const pending = inFlightConnections.get(type);
  if (pending) return pending;

  const attempt = openWalletConnection(type).finally(() => {
    inFlightConnections.delete(type);
  });
  inFlightConnections.set(type, attempt);
  return attempt;
}

async function openWalletConnection(type: WalletType): Promise<WalletConnection> {
  if (type === 'freighter') {
    const freighter = getFreighter();
    if (!freighter) {
      throw new TrustFlowError('Freighter not installed', 'UNAUTHORIZED');
    }
    try {
      const publicKey = await freighter.getPublicKey();
      if (!publicKey) {
        // Freighter installed but no key: almost always a locked wallet (#723).
        // Not a rejection, so it is not reported as USER_REJECTED.
        throw new TrustFlowError(
          'Freighter returned no public key. It may be locked: unlock Freighter and try again.',
          'UNAUTHORIZED',
        );
      }
      const reportedNetwork = await freighter.getNetwork();
      const network = reportedNetwork ? normalizeWalletNetwork(reportedNetwork) : 'TESTNET';
      return { type: 'freighter', publicKey, network };
    } catch (e: unknown) {
      if (isWalletRejection(e)) {
        throw TrustFlowError.userRejected(
          e instanceof Error ? e.message : 'User rejected Freighter connection',
          e,
        );
      }
      if (e instanceof TrustFlowError) throw e;
      throw TrustFlowError.wrap(e, 'UNAUTHORIZED');
    }
  }

  if (type === 'albedo') {
    const albedo = getAlbedo();
    if (!albedo) {
      throw new TrustFlowError('Albedo not available', 'UNAUTHORIZED');
    }
    try {
      const res = await albedo.publicKey();
      if (!res?.pubkey) {
        throw TrustFlowError.userRejected('User rejected Albedo connection');
      }
      // Use the same fallback as the Freighter path when the wallet does not report a network.
      const network = res.network ? normalizeWalletNetwork(res.network) : 'TESTNET';
      return { type: 'albedo', publicKey: res.pubkey, network };
    } catch (e: unknown) {
      if (isWalletRejection(e)) {
        throw TrustFlowError.userRejected(
          e instanceof Error ? e.message : 'User rejected Albedo connection',
          e,
        );
      }
      if (e instanceof TrustFlowError) throw e;
      throw TrustFlowError.wrap(e, 'UNAUTHORIZED');
    }
  }

  throw new TrustFlowError(`Wallet type ${type} not supported`, 'UNAUTHORIZED');
}

export async function disconnectWallet(): Promise<void> {
  // Most Stellar wallets don't have a disconnect API — clear local state only
}
