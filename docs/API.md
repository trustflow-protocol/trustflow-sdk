# TrustFlow SDK API Reference

## TrustFlowClient
- `constructor(config: ClientConfig)` — create a client instance
- `connect(): Promise<void>` — verify Stellar network connectivity
- `getBalance(address: string): Promise<string>` — get XLM balance

## Escrow Functions
- `createEscrow(client, params)` — create a new on-chain escrow
- `releaseEscrow(client, params)` — release funds to recipient
- `disputeEscrow(client, params)` — raise a dispute
- `cancelEscrow(client, id, caller)` — cancel pending escrow

## Wallet
- `connectWallet(type)` — connect Freighter or Albedo
- `disconnectWallet()` — clear wallet state

## Utils
- `strooopsToXLM(stroops)` — convert stroops to XLM string
- `xlmToStroops(xlm)` — convert XLM string to stroops bigint
- `withRetry(fn, opts)` — retry with exponential backoff
