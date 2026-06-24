# TrustFlow SDK

Type-safe TypeScript SDK for building escrow, milestone-payment, and dispute-resolution workflows on the TrustFlow Protocol.

The SDK gives application developers a small set of clients and utilities for:

- connecting to Stellar testnet or mainnet
- creating and releasing escrows
- building escrow parameters with validation-friendly helpers
- listing backend-backed gig or escrow records
- coordinating multi-signature release flows
- formatting and validating Stellar addresses, amounts, and escrow IDs

## Installation

```bash
npm install @trustflow/sdk
```

```bash
yarn add @trustflow/sdk
```

## Requirements

- Node.js 18 or newer
- A deployed TrustFlow Soroban contract ID
- Stellar accounts funded on the network you use
- Optional TrustFlow backend URL and API key for APIs such as `getGigs`

## Environment

Create a local `.env` file or export these values in your runtime:

```bash
TRUSTFLOW_CONTRACT_ID=CCONTRACT...
TRUSTFLOW_NETWORK=TESTNET
TRUSTFLOW_API_BASE_URL=https://api.example.com
TRUSTFLOW_API_KEY=dev-api-key
```

`TRUSTFLOW_NETWORK` should be `TESTNET` or `MAINNET`.

## Connect To Stellar

Use `TrustFlowClient` when your app needs network configuration, Horizon access, balance checks, or connection validation.

```typescript
import { TrustFlowClient } from '@trustflow/sdk';

const client = new TrustFlowClient({
  contractId: process.env.TRUSTFLOW_CONTRACT_ID!,
  network: 'TESTNET',
  apiBaseUrl: process.env.TRUSTFLOW_API_BASE_URL,
  apiKey: process.env.TRUSTFLOW_API_KEY,
});

await client.connect();

console.log(client.getConfig());
console.log('Connected:', client.isConnected());
```

## Create And Fund An Escrow

`TrustFlowEscrowClient` wraps escrow operations. Use `EscrowBuilder` when you want chainable parameter construction before calling `createEscrow`.

```typescript
import { EscrowBuilder, TrustFlowEscrowClient } from '@trustflow/sdk';
import { Networks } from '@stellar/stellar-sdk';

const escrowClient = new TrustFlowEscrowClient({
  contractId: process.env.TRUSTFLOW_CONTRACT_ID!,
  network: 'TESTNET',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
  apiBaseUrl: process.env.TRUSTFLOW_API_BASE_URL,
  apiKey: process.env.TRUSTFLOW_API_KEY,
});

const escrowParams = new EscrowBuilder()
  .setDepositor('GDEPOSITOR...')
  .setBeneficiary('GBENEFICIARY...')
  .setAmount('100')
  .setDeadline(17_280)
  .build();

const created = await escrowClient.createEscrow(escrowParams);

if (!created.ok) {
  throw new Error(created.error);
}

console.log('Escrow ID:', created.data.escrowId);
console.log('Funding transaction:', created.data.txHash);
```

The current escrow client returns an `SDKResult<T>` object, so callers should check `result.ok` before reading `result.data`.

## Release Funds

Release an escrow by passing the escrow ID and the signer or releaser address.

```typescript
import { TrustFlowEscrowClient } from '@trustflow/sdk';
import { Networks } from '@stellar/stellar-sdk';

const escrowClient = new TrustFlowEscrowClient({
  contractId: process.env.TRUSTFLOW_CONTRACT_ID!,
  network: 'TESTNET',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
});

const released = await escrowClient.releaseEscrow('esc-123', 'GDEPOSITOR...');

if (!released.ok) {
  throw new Error(released.error);
}

console.log('Release transaction:', released.data.txHash);
```

## List Gigs With Pagination

`getGigs` is backed by the TrustFlow API, so `apiBaseUrl` is required. Pagination is cursor-based.

```typescript
import { TrustFlowEscrowClient } from '@trustflow/sdk';
import { Networks } from '@stellar/stellar-sdk';

const escrowClient = new TrustFlowEscrowClient({
  contractId: process.env.TRUSTFLOW_CONTRACT_ID!,
  network: 'TESTNET',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
  apiBaseUrl: process.env.TRUSTFLOW_API_BASE_URL,
  apiKey: process.env.TRUSTFLOW_API_KEY,
});

let cursor: string | undefined;

do {
  const page = await escrowClient.getGigs({
    cursor,
    limit: 20,
    status: 'active',
    depositor: 'GDEPOSITOR...',
  });

  if (!page.ok) {
    throw new Error(page.error);
  }

  for (const gig of page.data.data) {
    console.log(gig.id, gig.status);
  }

  cursor = page.data.nextCursor ?? undefined;
} while (cursor);
```

## Multi-Signature Escrow Release

`MultiSigEscrowClient` coordinates M-of-N signature collection for release, cancel, or dispute operations.

```typescript
import { MultiSigEscrowClient } from '@trustflow/sdk';
import { Networks } from '@stellar/stellar-sdk';

const multiSig = new MultiSigEscrowClient({
  contractId: process.env.TRUSTFLOW_CONTRACT_ID!,
  network: 'TESTNET',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
});

const init = multiSig.initMultiSigOperation({
  escrowId: 'esc-123',
  signers: ['GAPPROVERA...', 'GAPPROVERB...'],
  threshold: 2,
  operationType: 'release',
  unsignedXdr: 'AAAA...',
  networkPassphrase: Networks.TESTNET,
});

if (!init.ok) {
  throw new Error(init.error);
}

multiSig.addSignature({
  operationId: init.data.operationId,
  signerAddress: 'GAPPROVERA...',
  signedXdr: 'AAAA-signed-by-a...',
});

multiSig.addSignature({
  operationId: init.data.operationId,
  signerAddress: 'GAPPROVERB...',
  signedXdr: 'AAAA-signed-by-b...',
});

const submitted = await multiSig.submitWhenReady(
  init.data.operationId,
  'https://horizon-testnet.stellar.org',
);

if (submitted.ok) {
  console.log('Submitted transaction:', submitted.data.txHash);
}
```

See `examples/multisig-escrow.ts` for a fuller walkthrough.

## Utility Helpers

```typescript
import {
  assertStellarAddress,
  isValidEscrowId,
  isValidXLMAmount,
  stroopsToXLM,
  truncateAddress,
  xlmToStroops,
} from '@trustflow/sdk';

assertStellarAddress('GDEPOSITOR...', 'depositor');

const stroops = xlmToStroops('10.5');
console.log(stroops.toString());
console.log(stroopsToXLM(stroops));
console.log(truncateAddress('GDEPOSITOR...'));
console.log(isValidXLMAmount('10.5'));
console.log(isValidEscrowId('esc-123'));
```

## Error Handling

The SDK uses two public error styles:

- `SDKResult<T>` for escrow clients, where callers check `result.ok`
- `TrustFlowError` exceptions for configuration and direct network-client failures

```typescript
import { TrustFlowClient, TrustFlowError } from '@trustflow/sdk';

try {
  const client = new TrustFlowClient({
    contractId: process.env.TRUSTFLOW_CONTRACT_ID!,
    network: 'TESTNET',
  });
  await client.connect();
} catch (error) {
  if (error instanceof TrustFlowError) {
    console.error(error.code, error.message);
  } else {
    throw error;
  }
}
```

## Project Scripts

```bash
npm install
npm test
npm run build
npm run lint
```

## Repository Layout

```text
src/
  auth/       Challenge and session helpers
  contract/   Contract invocation, simulation, and argument builders
  escrow/     Escrow clients, builders, monitoring, disputes, and multisig
  stellar/    Network, account, and transaction helpers
  utils/      Validation, formatting, retry, logging, and cache helpers
  wallet/     Freighter and Albedo wallet adapters
examples/     Runnable usage examples
docs/         Architecture, API, and quickstart notes
tests/        Jest test suite
```

## Documentation

- `docs/QUICKSTART.md`
- `docs/API.md`
- `docs/ARCHITECTURE.md`
- `examples/`

## Contributing

1. Fork the repository.
2. Install dependencies with `npm install`.
3. Create a topic branch.
4. Run `npm test`, `npm run build`, and `npm run lint`.
5. Open a pull request with a short summary and verification notes.

## License

MIT. See `LICENSE` for details.
