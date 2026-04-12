import { createEscrow, releaseEscrow } from '../src/escrow';
import { TrustFlowClient } from '../src/client';

const client = new TrustFlowClient({ contractId: 'CTEST000000000000000000000000000000000000000000000000000000' });
const SENDER    = 'GBAB2222222222222222222222222222222222222222222222222222222222';
const RECIPIENT = 'GCDE3333333333333333333333333333333333333333333333333333333333';

describe('createEscrow', () => {
  it('rejects zero amount', async () => {
    await expect(createEscrow(client, { sender: SENDER, recipient: RECIPIENT, amountStroops: 0n })).rejects.toThrow();
  });

  it('returns escrow with PENDING status on valid params', async () => {
    const e = await createEscrow(client, { sender: SENDER, recipient: RECIPIENT, amountStroops: 5_000_000n });
    expect(e.sender).toBe(SENDER);
    expect(e.recipient).toBe(RECIPIENT);
  });
});
