# TrustFlow SDK API Reference

## TrustFlowEscrowClient
- `createEscrow(params)` — create a new escrow
- `releaseEscrow(id, signer)` — release funds to beneficiary
- `getEscrow(id)` — read escrow state from contract

## EscrowBuilder
Fluent builder: `.setDepositor().setBeneficiary().setAmount().build()`

## EscrowMonitor
- `.on(event, handler)` — subscribe to escrow events
- `.startPolling(intervalMs, fetchFn)` — begin polling

## DisputeClient
- `.raiseDispute(params)` — raise a dispute
- `.getDispute(escrowId)` — get dispute status

## Auth
- `requestChallenge(apiUrl, address)` — get signing challenge
- `verifyAndGetToken(apiUrl, address, signature)` — exchange signature for JWT
