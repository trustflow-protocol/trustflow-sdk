import { TrustFlowError } from '../errors';
import { withTransientRetry } from '../utils/node-retry';
import type { ApiRetryConfig } from '../utils/http';
import { fetchWithTimeout } from '../utils/timeout';
import { assertStellarAddress } from '../utils/validation';
import { getNetworkConfig, StellarNetwork } from './network';

export interface AccountInfo {
  address: string;
  balanceXLM: string;
  sequenceNumber: string;
  isActive: boolean;
}

/** Horizon's own shape for "this account has never been funded". */
const HORIZON_NOT_FOUND = 404;

interface HorizonAccountResponse {
  balances?: Array<{ asset_type: string; balance: string }>;
  sequence: string;
}

/** An account that Horizon positively reports as existing. */
function unfundedAccount(address: string): AccountInfo {
  return { address, balanceXLM: '0', sequenceNumber: '0', isActive: false };
}

/**
 * Fetches an account's balance and sequence number from Horizon.
 *
 * ### Retry behaviour
 *
 * Transport errors, timeouts, `429` and `5xx` are retried with capped,
 * jittered exponential backoff (`ApiRetryConfig`, passed through by
 * `TrustFlowClient.getAccountInfo`). Any other `4xx` fails immediately.
 *
 * ### Timeouts
 *
 * `timeoutMs` bounds the raw `fetch` to Horizon; the request is aborted at
 * the deadline and the failure surfaces as a `TIMEOUT` `TrustFlowError`
 * (retried like any other transient failure while the budget lasts). It
 * defaults to the SDK-wide 10s when omitted.
 *
 * ### Why this can now throw
 *
 * It previously swallowed *every* failure and returned `isActive: false`, so a
 * two-second Horizon outage was indistinguishable from an account that had
 * never been funded — callers showed "account not active" and prompted users to
 * fund an account that already had money. Now:
 *
 * - `404` → `isActive: false` (the genuine "does not exist" case)
 * - any other `4xx` → throws `TrustFlowError` `NOT_FOUND`
 * - transport error / `5xx` / timeout after retries → throws `TrustFlowError`
 *   `CONNECTION_ERROR`, or `TIMEOUT` when the deadline fired
 *
 * @param address - Stellar `G...` public key
 * @param network - Stellar network to query
 * @param retry - Optional retry budget; defaults to
 *   {@link import('../utils/node-retry').DEFAULT_NODE_RETRY_CONFIG}
 * @param horizonUrl - Optional Horizon base URL override
 * @param timeoutMs - Optional request timeout in milliseconds
 * @returns The account's balance, sequence number and activation state
 * @throws {TrustFlowError} `NOT_FOUND` for a non-`404` client error,
 *   `CONNECTION_ERROR` when Horizon stays unreachable, or `TIMEOUT` when the
 *   deadline fires
 *
 * @example
 * ```typescript
 * const info = await fetchAccountInfo('G…', 'TESTNET');
 * if (!info.isActive) console.log('not funded yet');
 * ```
 */
export async function fetchAccountInfo(
  address: string,
  network: StellarNetwork,
  retry?: ApiRetryConfig,
  horizonUrl?: string,
  timeoutMs?: number,
): Promise<AccountInfo> {
  const effectiveHorizonUrl = horizonUrl ?? getNetworkConfig(network).horizonUrl;

  let response: Response | null;
  try {
    response = await withTransientRetry(
      async () => {
        const res = await fetchWithTimeout(
          `${effectiveHorizonUrl}/accounts/${address}`,
          undefined,
          timeoutMs,
          'horizon.fetchAccountInfo',
        );
        if (res.ok) return res;

        // A 404 is an answer, not a failure: the account genuinely does not
        // exist yet. Everything else is left to the shared classifier, which
        // retries 429/5xx and rejects other 4xx without a second attempt.
        if (res.status === HORIZON_NOT_FOUND) {
          return null;
        }
        throw new TrustFlowError(
          `Horizon rejected the account lookup for ${address} (HTTP ${res.status})`,
          res.status >= 500 ? 'CONNECTION_ERROR' : 'NOT_FOUND',
          {
            status: res.status,
            'retry-after': res.headers.get('retry-after'),
          },
        );
      },
      undefined,
      retry,
      'horizon.fetchAccountInfo',
    );
  } catch (e) {
    // A transport failure reaches here only once the retry budget is spent.
    // Surface it as a typed SDK error so callers never have to distinguish a
    // raw `TypeError: fetch failed` from a real "account not found".
    throw TrustFlowError.wrap(e, 'CONNECTION_ERROR');
  }

  if (response === null) {
    return unfundedAccount(address);
  }

  try {
    const data = (await response.json()) as HorizonAccountResponse;
    const xlm = data.balances?.find((b) => b.asset_type === 'native');
    return {
      address,
      balanceXLM: xlm?.balance ?? '0',
      sequenceNumber: data.sequence,
      isActive: true,
    };
  } catch (e) {
    throw new TrustFlowError(
      `Horizon returned an unparseable account payload for ${address}`,
      'CONNECTION_ERROR',
      e,
    );
  }
}

/** Default Stellar Testnet Friendbot URL. */
export const DEFAULT_FRIENDBOT_URL = 'https://friendbot.stellar.org';

/** Options for {@link fundTestnetAccount}. */
export interface FundTestnetAccountOptions {
  /** Override the Friendbot endpoint URL (defaults to `https://friendbot.stellar.org`). */
  friendbotUrl?: string;
  /** Per-request timeout in milliseconds (defaults to the SDK-wide 10s). */
  timeoutMs?: number;
  /** Optional retry budget for transient (`429`/`5xx`/network) failures. */
  retry?: ApiRetryConfig;
}

/** Outcome returned by {@link fundTestnetAccount}. */
export interface FundTestnetAccountResult {
  /** The funded Stellar `G...` public key. */
  address: string;
  /** `true` when Friendbot reported that the account already exists (`createAccountAlreadyExist`). */
  alreadyFunded: boolean;
  /** Transaction hash when newly funded by Friendbot. */
  hash?: string;
}

function isAlreadyFundedPayload(rawText: string): boolean {
  if (!rawText) return false;
  if (
    rawText.includes('createAccountAlreadyExist') ||
    rawText.includes('op_already_exists') ||
    rawText.toLowerCase().includes('account already funded') ||
    rawText.toLowerCase().includes('already exists')
  ) {
    return true;
  }
  try {
    const parsed = JSON.parse(rawText) as {
      detail?: string;
      extras?: {
        result_codes?: { transaction?: string; operations?: string[] };
      };
    };
    const ops = parsed?.extras?.result_codes?.operations ?? [];
    if (
      ops.includes('op_already_exists') ||
      ops.includes('createAccountAlreadyExist') ||
      (typeof parsed?.detail === 'string' &&
        parsed.detail.includes('createAccountAlreadyExist'))
    ) {
      return true;
    }
  } catch {
    // Non-JSON error body; substring checks above already ran.
  }
  return false;
}

/**
 * Ensures a Stellar testnet account is funded via Friendbot idempotently (#771).
 *
 * When Friendbot responds with `createAccountAlreadyExist` / `op_already_exists`
 * (HTTP 400 because the account has already been created and funded), this helper
 * resolves cleanly with `{ address, alreadyFunded: true }` instead of throwing.
 *
 * @param address - Stellar `G...` public key to fund
 * @param options - Optional Friendbot URL, timeout, and retry configuration
 * @returns Funding result indicating whether the account was newly funded or already existed
 */
export async function fundTestnetAccount(
  address: string,
  options: FundTestnetAccountOptions = {},
): Promise<FundTestnetAccountResult> {
  assertStellarAddress(address, 'address');
  const friendbotUrl = options.friendbotUrl ?? DEFAULT_FRIENDBOT_URL;
  const url = `${friendbotUrl}?addr=${encodeURIComponent(address)}`;

  try {
    return await withTransientRetry(
      async () => {
        const res = await fetchWithTimeout(
          url,
          undefined,
          options.timeoutMs,
          'friendbot.fundTestnetAccount',
        );

        if (res.ok) {
          let hash: string | undefined;
          try {
            const data = (await res.json()) as { hash?: string };
            if (typeof data?.hash === 'string') {
              hash = data.hash;
            }
          } catch {
            // Ignore empty/non-JSON body on 200 OK
          }
          return { address, alreadyFunded: false, hash };
        }

        const errorBody = await res.text().catch(() => '');
        if (res.status === 400 && isAlreadyFundedPayload(errorBody)) {
          return { address, alreadyFunded: true };
        }

        throw new TrustFlowError(
          `Friendbot rejected funding for ${address} (HTTP ${res.status})${errorBody ? `: ${errorBody}` : ''}`,
          res.status >= 500 ? 'CONNECTION_ERROR' : 'NETWORK_ERROR',
          {
            status: res.status,
            'retry-after': res.headers.get('retry-after'),
          },
        );
      },
      undefined,
      options.retry,
      'friendbot.fundTestnetAccount',
    );
  } catch (e) {
    throw TrustFlowError.wrap(e, 'CONNECTION_ERROR');
  }
}
