/**
 * Example: Show stage-level progress while a transaction is submitted
 *
 * Usage:
 *   TRUSTFLOW_CONTRACT_ID=<C...> STELLAR_SECRET_KEY=<S...> \
 *     npm run examples -- examples/submit-progress.ts
 *
 * `submit.onProgress` is called with `broadcasting` when the envelope is sent
 * and `confirming` when the pipeline starts polling for it, once per
 * transition. A UI can use that to show where a submission is, instead of one
 * spinner for the whole call. Replace `increment` with your contract method.
 */
import { Contract, Keypair } from '@stellar/stellar-sdk';
import { TransactionPipeline, TrustFlowClient } from '@trustflow/sdk';
import type { PipelineStage } from '@trustflow/sdk';

const BAR_WIDTH = 20;

/** Bar position and label to show when each stage starts. */
const STAGE_PROGRESS: Record<PipelineStage, { label: string; percent: number }> = {
  broadcasting: { label: 'Broadcasting', percent: 40 },
  confirming: { label: 'Confirming', percent: 80 },
};

/** Redraws one console line, e.g. `[########------------]  40% Broadcasting...`. */
function renderBar(percent: number, label: string): void {
  const filled = Math.round((percent / 100) * BAR_WIDTH);
  const bar = '#'.repeat(filled) + '-'.repeat(BAR_WIDTH - filled);
  process.stdout.write(`\r[${bar}] ${String(percent).padStart(3)}% ${label}...`);
}

async function main() {
  const contractId = process.env.TRUSTFLOW_CONTRACT_ID;
  const secret = process.env.STELLAR_SECRET_KEY;
  if (!contractId || !secret) {
    console.error('Set TRUSTFLOW_CONTRACT_ID and STELLAR_SECRET_KEY first.');
    process.exit(1);
  }

  const signer = Keypair.fromSecret(secret);
  const client = new TrustFlowClient({ contractId, network: 'TESTNET' });
  const pipeline = new TransactionPipeline(client);

  const result = await pipeline.run({
    sourceAccount: signer.publicKey(),
    operations: [new Contract(contractId).call('increment')],
    signers: [signer],
    submit: {
      onProgress: (stage) => {
        const { label, percent } = STAGE_PROGRESS[stage];
        renderBar(percent, label);
      },
    },
  });

  if (!result.ok) {
    process.stdout.write('\n');
    console.error(result.error.code, result.error.message);
    process.exit(1);
  }

  renderBar(100, 'Confirmed');
  process.stdout.write(`\nHash: ${result.data.hash}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
