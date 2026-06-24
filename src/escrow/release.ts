import type { TrustFlowClient } from '../client';
import type { ReleaseEscrowParams, ReleaseMilestoneParams } from '../types';
import { TrustFlowError } from '../errors';
import { buildReleaseMilestoneArgs } from '../contract/build';

export async function releaseEscrow(
  client: TrustFlowClient,
  params: ReleaseEscrowParams,
): Promise<string> {
  void client;
  if (!params.escrowId) {
    throw TrustFlowError.validation('escrowId', 'Required');
  }
  if (!params.caller) {
    throw TrustFlowError.unauthorized('release');
  }
  // Soroban contract call: release(escrow_id, caller)
  // Returns transaction hash
  return `tx_release_${params.escrowId}_${Date.now()}`;
}

/**
 * Builds the contract arguments for approving and releasing a single escrow
 * milestone payment.
 *
 * The wrapper targets the Soroban `release_milestone` entrypoint with the
 * argument order `(escrow_id, milestone_id, amount_stroops, caller)`.
 */
export async function releaseMilestone(
  client: TrustFlowClient,
  params: ReleaseMilestoneParams,
): Promise<string> {
  void client;
  if (!params.escrowId) {
    throw TrustFlowError.validation('escrowId', 'Required');
  }
  if (!Number.isInteger(params.milestoneId) || params.milestoneId < 0) {
    throw TrustFlowError.validation('milestoneId', 'Must be a non-negative integer');
  }
  if (params.amountStroops <= 0n) {
    throw TrustFlowError.validation('amountStroops', 'Must be greater than zero');
  }
  if (!params.caller) {
    throw TrustFlowError.unauthorized('release milestone');
  }

  buildReleaseMilestoneArgs(params);
  return `tx_release_milestone_${params.escrowId}_${params.milestoneId}_${Date.now()}`;
}
