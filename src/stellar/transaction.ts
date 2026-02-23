import { TransactionBuilder, Account, Networks, BASE_FEE } from '@stellar/stellar-sdk';
import type { TrustFlowClient } from '../client';

export async function buildBaseTransaction(
  client: TrustFlowClient,
  sourceAddress: string,
): Promise<TransactionBuilder> {
  const server = client.getServer();
  const account = await server.loadAccount(sourceAddress);
  const networkPassphrase = client.network === 'MAINNET' ? Networks.PUBLIC : Networks.TESTNET;
  return new TransactionBuilder(new Account(account.account_id, account.sequence), {
    fee: BASE_FEE,
    networkPassphrase,
  });
}

export function setTransactionTimeout(builder: TransactionBuilder, seconds = 300): TransactionBuilder {
  return builder.setTimeout(seconds);
}
