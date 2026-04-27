# TrustFlow SDK Quick Start

## Installation
```bash
npm install @trustflow/sdk
```

## Basic Usage
```ts
import { TrustFlowClient } from '@trustflow/sdk';

const client = new TrustFlowClient({
  contractId: 'YOUR_CONTRACT_ID',
  network: 'TESTNET',
});

await client.connect();
const balance = await client.getBalance('YOUR_ADDRESS');
console.log('Balance:', balance, 'XLM');
```

## Create an Escrow
```ts
import { createEscrow, xlmToStroops } from '@trustflow/sdk';

const escrow = await createEscrow(client, {
  sender: 'G...',
  recipient: 'G...',
  amountStroops: xlmToStroops('100'),
});
```
