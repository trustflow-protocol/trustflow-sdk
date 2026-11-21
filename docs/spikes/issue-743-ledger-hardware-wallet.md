# Spike: Ledger hardware-wallet signing through Freighter

Tracking issue: [#743](https://github.com/trustflow-protocol/trustflow-sdk/issues/743)

**Status: source review complete, live run pending.** Claims marked **[source]** were checked against
this repository at the commit this document lands on. Claims marked **[vendor]** come from how
Freighter and the Ledger Stellar app are documented to behave and were **not** reproduced here.
Claims marked **[live]** need a real Freighter install with a Ledger (or Speculos emulator) attached
and were **not** run for this document: no device was available, so no timings or console output are
recorded. Section 6 lists the exact live checks.

## TL;DR

| Question | Answer |
|---|---|
| Does it already work? | **No, but not because of Ledger.** The SDK's `window.freighter` contract does not match Freighter's real API (spike #312), so neither software-key nor Ledger signing works end to end today. Once that adapter is fixed, Ledger should not need a separate code path. |
| Does the API shape differ for hardware keys? | **[vendor] No.** The dapp-facing call and result shape are the same; Freighter talks to the device over WebHID inside the extension. The visible difference is time, plus new error cases (device locked, app not open, blind signing off). |
| Does the SDK's timeout handling cope with a physical confirmation? | **Transaction signing has no wait limit at all** (it never times out early, and it also never gives up). **What breaks is the transaction's validity window:** every SDK-built transaction expires 30 s after it is built, and a Ledger review of a Soroban call can take longer than that. |
| Should the SDK expose "check your device" state? | **Yes, as a wallet-agnostic "awaiting signature" state.** Freighter does not tell the dapp whether the account is hardware-backed, so the SDK cannot reliably say "check your Ledger". It can say "confirm in your wallet". |

## 1. Signing call sites today [source]

| Path | Wallet call | Wait limit | Validity window of the tx being signed |
|---|---|---|---|
| `signWithFreighter` (`src/stellar/signing.ts:39`, call at `:61`) | `freighter.signTransaction` | **none** | whatever the caller built |
| `createFreighterAdapter().sign` (`src/wallet/adapter.ts:41`) | `freighter.signTransaction` | **none** | whatever the caller built |
| `invokeContract(..., signAndSubmit)` (`src/contract/invoke.ts:124`, `:172`) | caller's `signAndSubmit` | none | **hard-coded `setTimeout(30)`**, built *before* simulation |
| Contract bindings (`src/contract/bindings.ts:162`) | caller | none | **hard-coded `setTimeout(30)`** |
| `TxPipeline.assemble` (`src/tx-pipeline/pipeline.ts:291`) | n/a, signs with `Keypair[]` (`types.ts:174`) | per-stage `withTimeout` | `params.timeoutSeconds ?? 30` |
| Fee-bump rebuild (`src/tx-pipeline/pipeline.ts:767`) | n/a, `Keypair` | per-stage | `setTimeout(30)` when no original bounds |
| `authenticateWithWallet` (`src/auth/challenge.ts`) | `signer.signMessage` | `signTimeoutMs`, default **60 s** (`:113`) | challenge lifetime **60 s** (`:58`) |

`TxPipeline` only takes `Keypair` signers, so it never reaches a wallet; Ledger matters only for the
`signWithFreighter` / adapter / `signAndSubmit` paths and for the auth challenge.

## 2. API shape: software key and Ledger key compared

- **[vendor]** Freighter can import a Ledger account (connected over WebHID). For that account, a
  `signTransaction` request opens the Freighter popup, which then asks the device to sign. The
  promise the dapp awaits resolves with the same `{ signedTxXdr, signerAddress }` (freighter-api 3.x
  and later) as for a software key. There is no hardware-specific method or flag.
- **[vendor]** Freighter's public API does not expose the account's key type, so a dapp cannot
  check up front that the user is on a Ledger.
- **[vendor]** On top of the software-key cases (user declined, wrong network), hardware signing
  can also fail because the device is locked, the Stellar app is not open, the device was unplugged
  mid-prompt, WebHID permission was not granted, or the transaction contains Soroban operations and
  the Stellar app's blind or hash signing setting is off. All of these reach the dapp as
  freighter-api `error: { code, message }` values. Their exact codes and messages are **[live]**.
- **[source]** The SDK sorts wallet errors only by their message text (`isWalletRejection`,
  `src/wallet/types.ts`). Errors that are not rejections become `SIGNING_ERROR`
  (`src/wallet/adapter.ts`). A device-locked or app-not-open error would surface as a generic
  `SIGNING_ERROR`. That is acceptable, but the app could not tell the user to unlock the device.
- **[vendor]** `signMessage` and `signAuthEntry` support for Ledger accounts in Freighter has been
  narrower than transaction signing, and some versions reject them for hardware accounts. That
  matters for `authenticateWithWallet`, which needs `signMessage`. This is **[live]**.

## 3. Timing: what a physical confirmation does to each limit

How long a Ledger confirmation takes is **[live]**. The relevant steps are: unlock the device, open
the Stellar app, review each field (a Soroban `invokeHostFunction` with arguments spans many
screens), then press both buttons. A careful user can easily take 30 to 90 s.

1. **Transaction validity window: breaks. [source + inference]**
   `invokeContract` builds the transaction with `setTimeout(30)` *before* simulating it. Then it
   hands the transaction to `signAndSubmit`, which waits for the wallet and then submits. The 30 s
   window therefore covers simulation, the full wallet review and submission. A slow Ledger
   confirmation makes the network reject the signed transaction as `txTooLate`. That costs no fee,
   but the user has to start over and confirm on the device again. `TxPipeline` exposes
   `timeoutSeconds`, but `invokeContract` and the bindings do not.
2. **Transaction signing wait: does not break, but has no upper bound. [source]**
   `signWithFreighter` and `adapter.sign` await the wallet with no deadline. A Ledger is never cut
   off too early. But an unplugged device or a closed popup that never answers leaves the promise
   (and `useTransaction`'s `pending` status) hanging forever. This is the missing timeout the issue
   calls "the related bug".
3. **Auth challenge signing: probably fine, and aligned. [source]**
   `signTimeoutMs` defaults to 60 s, the same as the backend challenge lifetime, so a longer client
   wait would only produce a `STALE_CHALLENGE` from the backend. A short challenge message is quick
   to confirm on the device. Whether Freighter supports `signMessage` on Ledger accounts at all
   (section 2) matters more.

## 4. UX affordances

- **[source]** `useTransaction` has only `idle | pending | success | error`
  (`src/hooks/useTransaction.ts`). It cannot tell "building/simulating" apart from "waiting for the
  user's wallet" or "submitted, waiting for the ledger". `useWalletSession` has `signingIn`, which
  covers the auth case.
- **Recommendation:** add a wallet-agnostic `awaitingSignature` phase, reported when the SDK hands
  the transaction to the wallet and cleared when the wallet answers. It could be a status value in
  `useTransaction`, an `onAwaitingSignature` callback on `invokeContract`/`signWithFreighter`, or
  both. The app's text should say "Confirm in your wallet (if you use a hardware wallet, check the
  device)". Because the key type is not visible (section 2), the SDK should not claim to know a
  Ledger is involved.
- Map device-state errors (locked, app closed, blind signing off) to a distinct, retryable code once
  their real shapes are recorded (section 6). Otherwise apps can only show the raw wallet message.

## 5. Recommended changes (follow-up issues)

| # | Change | Why | Size |
|---|---|---|---|
| 1 | Land the freighter-api adapter from spike #312 | Precondition: nothing signs against a real Freighter today, Ledger or not | already scoped in #312 |
| 2 | Add a `txTimeoutSeconds` option to `invokeContract`/bindings (default stays 30), and document raising it to around 180 for wallet signing | The 30 s window is the only real Ledger-specific failure | 0.5 day |
| 3 | Optional `signTimeoutMs` on `signWithFreighter` and the adapter's `sign`. The default should be no limit or at least the tx validity window, never shorter than a Ledger review. Use `withTimeout` and reject with `TIMEOUT` | Bounds the "promise never settles" case without cutting off hardware users | 0.5 day |
| 4 | `awaitingSignature` state in `useTransaction` plus an `onAwaitingSignature` hook on the signing helpers | Lets apps show "check your wallet/device" | 0.5 day |
| 5 | Error mapping for device locked / app not open / blind signing disabled, after recording the real codes | Actionable messages instead of a generic `SIGNING_ERROR` | 0.5 day after the live run |
| 6 | README/QUICKSTART note: hardware wallets via Freighter are supported through the same API; raise tx timeouts; enable blind or hash signing in the Ledger Stellar app for Soroban calls | Documentation | 0.25 day |

None of these need a Ledger-specific code path or a Ledger dependency in the SDK. Ledger support
stays inside Freighter. Talking to the device directly (e.g. `@ledgerhq/hw-app-str`) is out of scope
and is not recommended.

## 6. Live verification still required

Run on testnet in Chrome with current Freighter and a Ledger (or Speculos with the Stellar app),
after follow-up 1 lands. Record the Freighter, freighter-api, Ledger firmware and Stellar app
versions.

1. Software key against Ledger key: same `signTransaction` result shape? (Expected: yes.)
2. Time from request to resolution for (a) a classic payment and (b) a Soroban `invokeHostFunction`
   escrow call. Compare against the 30 s window, and capture the `txTooLate` failure when exceeded.
3. Exact `error.code` / `error.message` for: device locked, Stellar app closed, device unplugged
   mid-prompt, user rejects on device, and blind or hash signing disabled for a Soroban transaction.
4. `signMessage` on a Ledger account: supported, or rejected? Needed for `authenticateWithWallet`.
5. Popup closed without answering: does the freighter-api promise ever settle? This decides the
   default for follow-up 3.
