export type StellarAddress = string;
export type EscrowId = string;
export type TxHash = string;

export interface EscrowParams {
  depositor: StellarAddress;
  beneficiary: StellarAddress;
  amountXLM: string;
  tokenAddress?: StellarAddress;
  deadlineBlocks?: number;
}

export interface EscrowState {
  id: EscrowId;
  params: EscrowParams;
  status: 'pending' | 'active' | 'released' | 'disputed' | 'cancelled';
  contractEscrowId?: number;
  txHash?: TxHash;
  createdAt: number;
}

export interface DisputeParams {
  escrowId: EscrowId;
  reason: string;
  evidence?: string;
}

export type SDKResult<T> = { ok: true; data: T } | { ok: false; error: string };
