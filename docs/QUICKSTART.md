# TrustFlow SDK Quick Start

## Install
```bash
npm install @trustflow-protocol/sdk
```

## Create an Escrow
```typescript
import { TrustFlowEscrowClient, EscrowBuilder } from '@trustflow-protocol/sdk';

const client = new TrustFlowEscrowClient({
  contractId: process.env.CONTRACT_ID,
  network: 'TESTNET',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
});

const params = new EscrowBuilder()
  .setDepositor('GDEPOSITOR...')
  .setBeneficiary('GBENEFICIARY...')
  .setAmount('100')
  .build();

const result = await client.createEscrow(params);
if (result.ok) console.log('Escrow created:', result.data.escrowId);
```
