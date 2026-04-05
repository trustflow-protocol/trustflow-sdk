# 📦 TrustFlow SDK

[![NPM Version](https://img.shields.io/npm/v/@trustflow/sdk)](https://www.npmjs.com/package/@trustflow/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

# 📦 TrustFlow SDK

> **The professional TypeScript gateway to the TrustFlow Protocol.**

The TrustFlow SDK provides a type-safe, developer-friendly interface for interacting with TrustFlow smart contracts on the Stellar network. It abstracts away the complexity of XDR construction, transaction simulation, and storage management, allowing developers to build robust gig-economy applications with ease.

---

## ✨ Core Features

-   🛡️ **Type-Safe Contract Wrappers**: Full coverage for Escrow, Milestone, and Dispute contracts.
-   ⚡ **Simulation Engine**: Built-in wrappers for `.simulate()` to predict gas costs and outcomes.
-   🔒 **Multi-Sig Ready**: Logic for constructing and aggregating signatures for corporate escrows.
-   🧩 **Zod Schema Exports**: Share data validation logic between your frontend and backend.
-   📦 **Modern Bundling**: Standardized ESM and CJS outputs via `tsup`.
-   🛠️ **Event Decoding**: Native helpers to parse Soroban XDR events into clean TypeScript interfaces.

---

## 🚀 Installation

```bash
npm install @trustflow/sdk
# or
yarn add @trustflow/sdk
```

---

## 📖 Technical Reference

### 1. Initializing the Client
The `TrustFlowClient` is the main entry point, handling network configuration and RPC connections.

```typescript
import { TrustFlowClient, Networks } from '@trustflow/sdk';

const client = new TrustFlowClient({
  network: Networks.TESTNET,
  rpcUrl: 'https://soroban-testnet.stellar.org',
  apiKey: 'your-optional-api-key'
});
```

### 2. Escrow Management (`client.escrow`)
-   **`.create(params)`**: Initializes a new milestone-based vault.
-   **`.fund(escrowId, amount)`**: Locks USDC assets into the contract.
-   **`.releaseMilestone(escrowId, trancheIndex)`**: Approves a partial payment.
-   **`.getGigs(cursor, limit)`**: Fetches paginated gig history.

### 3. Community Governance (`client.juror`)
-   **`.vote(disputeId, choice, reasoning)`**: Casts a secure vote in the courtroom.
-   **`.claimRewards()`**: Withdraws earned juror fees and incentives.

### 4. Storage & Profiles (`client.storage` / `client.profiles`)
-   **`.storage.upload(file)`**: Effortless IPFS pinning for evidence and deliverables.
-   **`.profiles.update(bio, socialLinks)`**: Type-safe updates to your decentralized resume.

---

## 🛡️ Reliability & Security

-   **Auto-Retries**: Built-in `axios-retry` logic to handle flaky RPC endpoints.
-   **XDR Validation**: Every transaction is structurally validated via Jest matchers before submission.
-   **NPM Provenance**: All releases utilize strict GitHub Actions provenance for supply-chain security.
-   **Strict Linting**: Enforced clean code standards via Prettier and ESlint strict-mode.

---

## 🗺️ SDK Roadmap (In-Flight)

- [ ] **Simulation Wrappers**: High-level API for predicting transaction success.
- [ ] **Advanced Pagination**: Cursor-based fetching for high-volume gig lists.
- [ ] **Typedoc Integration**: Automated API reference documentation generation.
- [ ] **NPM Provenance Enforced**: Finalizing the secure release pipeline.

---

## 🤝 Community & Support

- **Documentation**: [Full API Reference](https://docs.trustflow.xyz)
- **Examples**: Check the `/examples` directory for quickstart snippets.
- **Contribute**: We follow strict ESM standards. PRs must pass `npm run test:xdr`.

---

*Securing the future of work, one transaction at a time.*

Based on our [GitHub Issues](https://github.com/trustflow-protocol/trustflow-sdk/issues):

- [ ] **`.getGigs()` Pagination**: Automatically handle high-volume cursor-based reading.
- [ ] **`.claim()` Shortcut**: One-click withdrawal for cleared milestone funds.
- [ ] **Simulation Counterparts**: `.simulateRelease()` for fee-previewing transactions.
- [ ] **Auto-Retries**: Intelligent `axios-retry` for transient RPC failures.
- [ ] **NPM Provenance**: Secure publishing through strict OIDC provenance.

---

## 🤝 Community

Join the movement to decentralize trust in the gig economy. 

- **Issues**: Report bugs or request features at [trustflow-sdk/issues](https://github.com/trustflow-protocol/trustflow-sdk/issues).
- **Discussions**: Share ideas on our [Stellar Community Forum](https://stellar.org/community).

---

## 📜 License

MIT License. Copyright (c) 2026 TrustFlow Protocol.

## Documentation
- [Quick Start](./docs/QUICKSTART.md)
- [API Reference](./docs/API.md)
