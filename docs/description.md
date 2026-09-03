Description
Follow-up from the #79 spike (see docs/spikes/issue-79-retry-session-multisig.md).

TransactionPipeline (src/tx-pipeline/pipeline.ts) implements its own local withRetry helper
(exponential backoff, per-stage error wrapping). src/utils/retry.ts exports a generic retry()
helper with a very similar exponential-backoff shape, but a different signature (fixed
attempts/delay vs. a policy object, no per-attempt callback, no stage-aware error wrapping). The
two aren't unified, so there are two backoff implementations to maintain.

