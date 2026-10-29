# API Reference

This document provides a comprehensive reference for the TrustFlow SDK public API.

---

## TrustFlowClient

The main entry point for interacting with the TrustFlow Protocol.

- `new TrustFlowClient(config)` — Initializes the client with network and contract options.
  - `config.contractId` — Soroban contract ID
  - `config.network` — `'TESTNET'` or `'MAINNET'`
  - `config.rpcUrl` — Soroban RPC endpoint URL
  - `config.networkPassphrase` — Stellar network passphrase
  - `config.ipfs` — Optional IPFS configuration (`apiKey`, `apiUrl`, `gatewayUrl`, `fallbackGateways`, `gateways`)
  - `config.retry` — Optional retry configuration (`retries`, `retryDelayMs`, `maxRetryDelayMs`)
  - `config.accounts` — Optional array of multi-account configurations
- `.connect()` — Establishes connection and verifies network settings.
- `.storage` — Built-in `IPFSStorage` instance for file uploads and resolution.

---

## IPFSStorage

Handles file pinning to IPFS pinning services (web3.storage-compatible APIs) and retrieving/resolving content across multi-gateway fallbacks with CID validation.

- `new IPFSStorage(config?)` — `config.apiUrl` (default: web3.storage-compatible upload API), `config.apiKey`, `config.gatewayUrl`, `config.fallbackGateways`, `config.gateways`
  - `gatewayUrl`: Primary IPFS gateway URL used by `resolve()` (defaults to `https://ipfs.io/ipfs/`).
  - `fallbackGateways` / `gateways`: Array of fallback IPFS gateway URLs tried in sequence if the primary gateway fails or times out.
- `.upload(file, options?)` — uploads a `Buffer`, `Uint8Array`, `ArrayBuffer`, `Blob` or browser `File` (`options.filename`, `options.contentType`, plus request options); returns `SDKResult<{ cid, url }>`
- `.resolve<T>(cid, options?)` — Resolves and retrieves content for the given IPFS CID.
  - Validates the CID before requesting.
  - Iterates through the configured primary gateway and any `fallbackGateways` / `gateways` until a successful response is received.
  - `options.abortSignal` — Optional `AbortSignal` to cancel the resolution request.
  - Returns `SDKResult<T>` (or throws a `TrustFlowError` with code `STORAGE_GATEWAY_ERROR` or `VALIDATION_ERROR` depending on call context / unhandled failure mode).
- Also available as `client.storage.upload(file)` and `client.storage.resolve(cid)` on `TrustFlowClient` (configure via `new TrustFlowClient({ ipfs: { apiKey, gatewayUrl, fallbackGateways } })`).

---

## CID Validation Helpers

Exported from `src/storage/index.ts` (and `@trustflow/sdk/storage` if exported):

- `isValidCid(value: string): boolean` — Returns `true` if the given string is a valid IPFS CID (supports CIDv0 and CIDv1), or `false` otherwise.
- `validateCID(value: string): { valid: boolean; version?: number; error?: string }` — Validates a CID string and returns detailed validation results including the detected CID version.
- `getCidVersion(value: string): number | null` — Returns the CID version (`0` or `1`) for a valid CID string, or `null` if invalid.
- `assertValidCid(value: string): void` — Asserts that a string is a valid CID, throwing a `TrustFlowError` with code `VALIDATION_ERROR` if invalid.

---

## TrustFlowEscrowClient

Manages escrow lifecycles on the Stellar/Soroban network.

- `new TrustFlowEscrowClient(config)` — Initializes the escrow client.
- `.createEscrow(params)` — Creates a new escrow.
- `.fund(escrowId, caller, amountStroops, tokenContractId?)` — Funds an existing escrow.
- `.claim(escrowId, beneficiary)` — Claims funds for an escrow.

---

## MultiSigEscrowClient

Coordinates multi-signature operations for escrows (M-of-N approvals).

- `new MultiSigEscrowClient(config)` — Initializes the multi-sig client.
- `.initMultiSigOperation(params)` — Initializes a multi-sig operation.
- `.addSignature(params)` — Adds a signature to an active operation.
- `.submitWhenReady(operationId, horizonUrl)` — Submits the transaction once the signature threshold is met.
- `.exportState(operationId)` — Exports operation state for cross-process coordination.
- `.importState(snapshot)` — Imports operation state from a snapshot.

---

## JurorClient

Manages dispute resolution and juror voting.

- `new JurorClient(config)` — Initializes the juror client.
- `.vote(params)` — Casts a plaintext or encrypted vote on a dispute.

---

## ProfileClient

Manages user profiles via the backend API.

- `new ProfileClient(apiUrl, authToken)` — Initializes the profile client.
- `.getProfile(publicKey)` — Retrieves a user profile.
- `.updateProfile(publicKey, data)` — Updates a user profile.

---

## TransactionPipeline

Orchestrates transaction construction, simulation, fee adjustment, and submission.

- `new TransactionPipeline(config)` — Initializes the transaction pipeline.
- `.execute(tx)` — Executes the pipeline for a given transaction.

---

## Session Storage

Functions for managing user session tokens in browser or Node environments:

- `saveSession(token, options?)` — Saves an auth session.
- `loadSession(options?)` — Loads the current session.
- `clearSession(options?)` — Clears the active session.
- `configureSessionStorage(adapter)` — Configures a custom session storage adapter (e.g., Redis or file store for Node).
- `isSessionExpired(session)` — Checks if a session has expired.

---

## Wallet & Utilities

- `connectWallet(walletType)` — Connects to a wallet provider (e.g., Freighter).
- `xlmToStroops(xlm)` / `stroopsToXlm(stroops)` — Currency conversion helpers.
- `generateSep7Uri(txXdr, options)` — Generates a SEP-0007 transaction deep link or QR payload.
