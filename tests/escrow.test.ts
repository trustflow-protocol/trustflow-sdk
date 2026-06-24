import { EscrowBuilder } from '../src/escrow/builder';
import { nativeToScVal, Address, Keypair } from '@stellar/stellar-sdk';
import { buildReleaseMilestoneArgs } from '../src/contract/build';
import { releaseMilestone } from '../src/escrow/release';
import { TrustFlowClient } from '../src/client';

describe('EscrowBuilder', () => {
  const ADDR_A = 'G' + 'A'.repeat(55);
  const ADDR_B = 'G' + 'B'.repeat(55);

  it('builds valid escrow params', () => {
    const params = new EscrowBuilder().setDepositor(ADDR_A).setBeneficiary(ADDR_B).setAmount('100').build();
    expect(params.depositor).toBe(ADDR_A);
    expect(params.amountXLM).toBe('100');
  });

  it('throws if depositor missing', () => {
    expect(() => new EscrowBuilder().setBeneficiary(ADDR_B).setAmount('1').build()).toThrow('depositor required');
  });

  it('sets optional deadline', () => {
    const p = new EscrowBuilder().setDepositor(ADDR_A).setBeneficiary(ADDR_B).setAmount('50').setDeadline(1000).build();
    expect(p.deadlineBlocks).toBe(1000);
  });
});

describe('releaseMilestone', () => {
  const CALLER = Keypair.random().publicKey();
  const client = new TrustFlowClient({
    contractId: 'C' + 'D'.repeat(55),
    network: 'TESTNET',
  });

  it('builds release_milestone contract args in the expected XDR order', () => {
    const args = buildReleaseMilestoneArgs({
      escrowId: 'esc-42',
      milestoneId: 3,
      amountStroops: 25_000_000n,
      caller: CALLER,
    });

    const expected = [
      nativeToScVal('esc-42', { type: 'string' }),
      nativeToScVal(3, { type: 'u32' }),
      nativeToScVal(25_000_000n, { type: 'i128' }),
      new Address(CALLER).toScVal(),
    ];

    expect(args.map((arg) => (arg as { toXDR: (format: 'base64') => string }).toXDR('base64'))).toEqual(
      expected.map((arg) => arg.toXDR('base64')),
    );
  });

  it('returns a milestone release transaction placeholder for valid input', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(123);

    await expect(
      releaseMilestone(client, {
        escrowId: 'esc-42',
        milestoneId: 3,
        amountStroops: 25_000_000n,
        caller: CALLER,
      }),
    ).resolves.toBe('tx_release_milestone_esc-42_3_123');

    jest.restoreAllMocks();
  });

  it('rejects invalid milestone release params', async () => {
    await expect(
      releaseMilestone(client, {
        escrowId: '',
        milestoneId: 0,
        amountStroops: 1n,
        caller: CALLER,
      }),
    ).rejects.toThrow('escrowId');

    await expect(
      releaseMilestone(client, {
        escrowId: 'esc-42',
        milestoneId: -1,
        amountStroops: 1n,
        caller: CALLER,
      }),
    ).rejects.toThrow('milestoneId');

    await expect(
      releaseMilestone(client, {
        escrowId: 'esc-42',
        milestoneId: 1,
        amountStroops: 0n,
        caller: CALLER,
      }),
    ).rejects.toThrow('amountStroops');
  });
});
