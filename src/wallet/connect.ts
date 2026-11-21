import type { WalletConnection, WalletType } from './types';
import { isWalletRejection } from './types';
import { getFreighter } from './freighter';
import { getAlbedo } from './albedo';
import { TrustFlowError } from '../errors';

/** Options for {@link connectWallet}. */
export interface ConnectWalletOptions {
  /**
   * Freighter only: called with the new public key when the user switches
   * accounts in the extension. The SDK registers one `message` listener on
   * `window` for this and removes it on {@link disconnectWallet} or on the next
   * `connectWallet` call, so connect/disconnect cycles never leak listeners (#737).
   */
  onAccountChange?: (publicKey: string) => void;
}

interface MessageTarget {
  addEventListener(
    type: 'message',
    listener: (event: { source?: unknown; data?: unknown }) => void,
  ): void;
  removeEventListener(
    type: 'message',
    listener: (event: { source?: unknown; data?: unknown }) => void,
  ): void;
}

/** The single account-change listener the SDK currently has on `window`, if any. */
let accountWatcher: {
  target: MessageTarget;
  handler: (event: { source?: unknown; data?: unknown }) => void;
} | null = null;

/**
 * Bumped by every `connectWallet` and `disconnectWallet` call. A connect only
 * installs its listener if no newer connect or disconnect happened while it was
 * awaiting the wallet, so overlapping calls can never leave a stray listener.
 */
let connectionGeneration = 0;

/** Removes the account-change listener registered by the last `connectWallet`, if any. */
function stopAccountWatcher(): void {
  connectionGeneration++;
  if (accountWatcher) {
    accountWatcher.target.removeEventListener('message', accountWatcher.handler);
    accountWatcher = null;
  }
}

/** Freighter's content script tags the messages it posts to the page with a `FREIGHTER_*` source. */
function isFreighterMessage(data: unknown): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as { source?: unknown }).source === 'string' &&
    (data as { source: string }).source.startsWith('FREIGHTER')
  );
}

/**
 * Registers the (single) account-change listener for a Freighter connection.
 * On a Freighter message it re-reads the public key from the wallet — the
 * authoritative answer — and reports it if it changed. Messages that arrive
 * while that read is in flight are ignored, so the read's own response cannot
 * trigger another read.
 */
function startAccountWatcher(
  initialPublicKey: string,
  onAccountChange: (publicKey: string) => void,
): void {
  // Same lookup as `getFreighter()`: the page's `window`, absent outside a browser.
  const target = (globalThis as { window?: Partial<MessageTarget> }).window;
  if (
    !target ||
    typeof target.addEventListener !== 'function' ||
    typeof target.removeEventListener !== 'function'
  ) {
    return;
  }
  let current = initialPublicKey;
  let checking = false;
  const handler = (event: { source?: unknown; data?: unknown }) => {
    if (event.source !== undefined && event.source !== target) return;
    if (!isFreighterMessage(event.data) || checking) return;
    const freighter = getFreighter();
    if (!freighter) return;
    checking = true;
    freighter
      .getPublicKey()
      .then((publicKey) => {
        // Ignore the answer if this listener was removed while it was pending.
        if (accountWatcher?.handler !== handler) return;
        if (publicKey && publicKey !== current) {
          current = publicKey;
          onAccountChange(publicKey);
        }
      })
      .catch(() => {
        // A failed re-read is not an account change; keep the last known key.
      })
      .finally(() => {
        checking = false;
      });
  };
  target.addEventListener('message', handler);
  accountWatcher = { target: target as MessageTarget, handler };
}

/** Wallets may name the public network `public` or `pubnet`; the SDK calls it `MAINNET`. */
function normalizeWalletNetwork(name: string): string {
  const upper = name.toUpperCase();
  return upper === 'PUBLIC' || upper === 'PUBNET' ? 'MAINNET' : upper;
}

/**
 * Attempts to establish a connection with the specified Stellar wallet.
 * If the user rejects the connection dialog, a retryable TrustFlowError with
 * code 'USER_REJECTED' is thrown, leaving the connection state clean for subsequent attempts.
 *
 * @param type - Wallet to connect, defaults to `'freighter'`
 * @param options - `onAccountChange` to be told when the Freighter account changes
 */
export async function connectWallet(
  type: WalletType = 'freighter',
  options: ConnectWalletOptions = {},
): Promise<WalletConnection> {
  // A new connection supersedes the previous one, so never stack a second listener (#737).
  stopAccountWatcher();
  const generation = connectionGeneration;
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
      if (options.onAccountChange && generation === connectionGeneration) {
        startAccountWatcher(publicKey, options.onAccountChange);
      }
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

/**
 * Disconnects the wallet. Most Stellar wallets have no disconnect API, so this
 * clears the SDK's local state: in particular it removes the account-change
 * listener registered by {@link connectWallet}, leaving none behind (#737).
 */
export async function disconnectWallet(): Promise<void> {
  stopAccountWatcher();
}
