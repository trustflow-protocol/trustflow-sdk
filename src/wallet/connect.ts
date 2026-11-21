import type { WalletConnection, WalletType } from './types';
import { isWalletRejection } from './types';
import { getFreighter } from './freighter';
import { getAlbedo } from './albedo';
import { TrustFlowError, UnsupportedWalletVersionError } from '../errors';
import { clearAllSessions } from '../auth/session';

/** Wallets may name the public network `public` or `pubnet`; the SDK calls it `MAINNET`. */
function normalizeWalletNetwork(name: string): string {
  const upper = name.toUpperCase();
  return upper === 'PUBLIC' || upper === 'PUBNET' ? 'MAINNET' : upper;
}

/**
 * Attempts to establish a connection with the specified Stellar wallet.
 * If the user rejects the connection dialog, a retryable TrustFlowError with
 * code 'USER_REJECTED' is thrown, leaving the connection state clean for subsequent attempts.
 */
export async function connectWallet(type: WalletType = 'freighter'): Promise<WalletConnection> {
  if (type === 'freighter') {
    const rawFreighter = typeof window !== 'undefined' ? (window as any)?.freighter : undefined;
    if (!rawFreighter) {
      throw new TrustFlowError('Freighter not installed', 'UNAUTHORIZED');
    }
    const missingMethods = (['getPublicKey', 'getNetwork'] as const).filter(
      (method) => typeof rawFreighter[method] !== 'function',
    );
    if (missingMethods.length > 0) {
      throw new UnsupportedWalletVersionError('Freighter', [...missingMethods]);
    }
    const freighter = getFreighter()!;
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

/**
 * Performs a full logout by disconnecting the active wallet and purging all
 * cached authentication session state (JWTs, refresh tokens, and scoped
 * session keys) via `clearAllSessions()` (#742).
 *
 * Use `disconnectAll()` when signing a user out of the application completely,
 * and `disconnectWallet()` when only tearing down the wallet connection while
 * keeping any existing backend auth session intact.
 */
export async function disconnectAll(): Promise<void> {
  try {
    await disconnectWallet();
  } finally {
    clearAllSessions();
  }
}
