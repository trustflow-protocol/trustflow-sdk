# TrustFlow SDK Architecture

## Module Structure
```
src/
├── types/          # Core TypeScript interfaces
├── escrow/         # Escrow client, builder, monitor, dispute
├── auth/           # Challenge-sign auth flow
├── stellar/        # Network config, account, transaction helpers
└── utils/          # Validation, formatting, retry, error, logger
```

## Design Principles
1. **Result types** — `SDKResult<T>` avoids thrown exceptions in public APIs
2. **Immutable builders** — `EscrowBuilder` produces validated `EscrowParams`
3. **Network agnostic** — all clients accept `StellarNetwork` enum
4. **No side effects** — utilities are pure functions
