import { Horizon } from '@stellar/stellar-sdk';
import type { TrustFlowClient } from '../client';

export interface AccountInfo {
  id: string;
  sequence: string;
  xlmBalance: string;
  subentryCount: number;
}

export async function loadAccountInfo(
  client: TrustFlowClient,
  address: string,
): Promise<AccountInfo> {
  const server = client.getServer();
  const account = await server.loadAccount(address);
  const xlm = account.balances.find((b: any) => b.asset_type === 'native');
  return {
    id: account.account_id,
    sequence: account.sequence,
    xlmBalance: xlm?.balance ?? '0',
    subentryCount: account.subentry_count,
  };
}

export async function accountExists(client: TrustFlowClient, address: string): Promise<boolean> {
  try { await client.getServer().loadAccount(address); return true; }
  catch { return false; }
}
