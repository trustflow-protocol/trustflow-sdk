import type { TrustFlowClient } from '../client';
import type { DisputeEscrowParams } from '../types';
import { TrustFlowError } from '../errors';

export async function disputeEscrow(
  client: TrustFlowClient,
  params: DisputeEscrowParams,
): Promise<string> {
  if (!params.escrowId) throw TrustFlowError.validation('escrowId', 'Required');
  if (!params.reason || params.reason.trim().length < 10) {
    throw TrustFlowError.validation('reason', 'Must be at least 10 characters');
  }
  // Soroban contract call: raise_dispute(escrow_id, reason)
  return `tx_dispute_${params.escrowId}_${Date.now()}`;
}
