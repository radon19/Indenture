# How Indenture Uses the Attestcoin Protocol

**One paragraph:** Indenture proves Ethereum repayment history on Creditcoin
without trusting any reporter, oracle, or bridge. The Attestcoin Protocol's
native block-prover precompile (`0xFD2`) verifies that a source transaction is
really inside a real source block and that the block really belongs to the
source chain. Our registry contract then decodes that transaction's receipt and
scores whoever the logs name as borrower. Everything after the precompile says
"yes" is deterministic decoding — no opinions, no feeds, no allowlists.

## 1. The trust problem it removes

A credit score computed from another chain's history has exactly one load-bearing
question: **did that transaction really happen there?** The naive answers all
fail:

| Approach | Why it fails |
|---|---|
| Trust the submitter | Anyone can claim anything |
| Trust an oracle committee | A new trusted third party with a feed to bribe |
| Trust a bridge message | Bridge validator sets get captured |
| Replay full blocks on Creditcoin | Prohibitively expensive per proof |

Attestcoin's answer: the destination chain itself checks a Merkle inclusion proof
against attested block roots, plus a continuity proof chaining the block back to
attested history — executed synchronously inside a Creditcoin block by a
precompile. Forging history means forging the attestor set's signatures, not
fooling our code.

## 2. The primitives we use

All paths below are exact — every claim in this document resolves to a file.

### 2.1 The precompile: `0xFD2` (4050)

`contracts/src/vendored/INativeQueryVerifier.sol` — the interface; address
`0x000…0FD2` resolved by `NativeQueryVerifierLib.getVerifier()`. Two entry
shapes, each in state-changing and view flavors:

- `verifyAndEmit(chainKey, height, encodedTransaction, merkleProof,
  continuityProof)` — verifies **and emits**
  `TransactionVerified(chainKey, height, transactionIndex)`. This is what our
  registry calls (`ASCBase._verifyProof`, `contracts/src/vendored/ASCBase.sol:87`).
- `verify(...)` — same checks, read-only. Used for dry runs, never for scoring.
- `calculateTxIndex(merkleProof)` — derives the transaction's index inside its
  block from the Merkle path. Feeds the replay guard below.

Note what the precompile does **not** do: it proves *inclusion and continuity —
nothing else*. It does not check the transaction succeeded, which chain the
caller *claims*, or which contract emitted the logs. Section 4 is our registry
doing exactly those three jobs.

### 2.2 The ASC pattern: verify → dedupe → dispatch

`contracts/src/vendored/ASCBase.sol` — the whitepaper base layer for
Application Smart Contracts. `execute()` runs the same four beats for every
proof:

```solidity
// ASCBase.execute — contracts/src/vendored/ASCBase.sol:37
queryId = keccak256(chainKey, blockHeight, txIndex);   // via calculateTxIndex
require(!processedQueries[queryId], "Query already processed");
require(_verifyProof(...), "Proof of inclusion verification failed");
processedQueries[queryId] = true;
_processAndEmitEvent(action, queryId, chainKey, blockHeight, encodedTransaction);
```

The replay guard falls out of the math: one genuine repayment resubmitted with a
fresh proof attempt reverts with `"Query already processed"` instead of scoring
twice. Our frontend treats that revert as a success state (permissionless
ingest means someone may beat you to it — `worker/README.md`).

### 2.3 The decoder: `EvmV1Decoder`

`contracts/src/vendored/EvmV1Decoder.sol` — pure functions over the proved
transaction bytes:

- `getTransactionType` / `isValidTransactionType` — gate exotic tx shapes.
- `decodeReceiptFields` — returns `ReceiptFields` with `receiptStatus` and the
  `receiptLogs[]` (`LogEntry { address_, topics, data }`), plus topic-filter
  helpers.

### 2.4 The builder: ProofBuilder SDK (off-chain)

`worker/prove.ts:162` — `new proofProvider.service.ProofBuilder(chainKey,
CREDITCOIN_PROOF_BUILDER_URL).getProof(txHash)` returns `{ success, data }`
with `merkleProof` (`root`, `siblings[]` of `{hash, isLeft}`) and
`continuityProof` (`lowerEndpointDigest`, `roots[]`). `proveTx` normalizes the
SDK's alternative field names (`txBytes`/`encodedTransaction`,
`headerNumber`/`blockHeight`/`height`, …) into execute-ready args and throws
`proof missing field for <k>` if any are absent — so a builder schema change
fails loud, never silently short.

## 3. End-to-end: one repayment, five hops

Conventions: source `chainKey` is `3` = Ethereum mainnet, `1` = Sepolia
(`creditScore.sol:13-14`; the worker enforces the same pair).

1. **Pre-check (off-chain).** `fetchReceipt` (`worker/prove.ts:147`) pulls the
   source receipt over `SOURCE_RPC_URL_<key>`: must exist, `status == 1`.
   `summarizeLogs` names protocol/kind/borrower/amount best-effort from the
   log shapes — the contract remains the judge.
2. **Prove (off-chain).** `proveTx` waits on the attestation service and returns
   `{ action: 0, chainKey, blockHeight, encodedTransaction, merkleRoot,
   siblings, lowerEndpointDigest, continuityRoots }`.
3. **Submit.** The frontend simulates `execute()` first, then it's sent — from
   the user's wallet, or from the worker CLI with a funded key. No backend
   *service* key ever signs an ingest in API mode.
4. **Verify + dedupe (precompile + ASCBase).** Query id derived, replay checked,
   `verifyAndEmit` run, query marked processed.
5. **Score (our `_processAndEmitEvent`, `creditScore.sol:456`).** Gate
   `action == 0` and valid tx type; require `receiptStatus == 1`; route each log
   by `sources[chainKey][emitter]`; bank the first repayment (same user+coin
   sums in), penalize liquidations, ignore dust, touch tenure. Unknown reserve
   or missing price **reverts before consuming anything** — the proof stays
   retryable after registration.

## 4. What the precompile proves vs what the registry checks

The table judges actually want:

| Check | Where | Attack it stops |
|---|---|---|
| Merkle inclusion in the block | precompile | Fabricated repayment |
| Continuity to attested history | precompile | Forged chain / reorged block |
| Query-id replay guard | `ASCBase:49` | Resubmitting one genuine repay to farm score |
| `receiptStatus == 1` | registry `:472` | A **reverted** repayment counting as success |
| `(chainKey, emitter)` registered source | registry `:479` | Look-alike pool on an untrusted chain; Sepolia address impersonating mainnet |
| Dispatch on log's own emitter + `topic0` | registry `:522` | Copycat contract emitting same-shaped events; the `action` arg is a hint, never trusted |
| Reserve registered + priced | registry `:380` | Obscure 0-decimal token inflating capacity; reverts retryably |
| Same-emitter/coin/user borrow+repay | registry `:604` | Zero-capital flash loan minting capacity |
| First-repay-wins banking | registry `:579` | Multi-log stuffing inside one receipt |

## 5. Setup and run

```bash
# worker env (worker/.env.example documents every variable)
SOURCE_CHAIN_KEY=3
CREDITCOIN_PROOF_BUILDER_URL=   # attestation service
SOURCE_RPC_URL_3=               # receipt pre-check, per-chain wins
CREDITCOIN_RPC_URL=             # submitting key's endpoint
CREDITCOIN_PRIVATE_KEY=         # omit for --dry runs
SCORE_CONTRACT=0xFA19b4DDCEA765Ce8662ec9ea15438Adce44E237
```

```bash
cd worker && bun install
bun worker.ts <txHash> --chain 3 --dry   # pre-check + proof summary, no keys
bun worker.ts <txHash> --chain 3         # full ingest from a funded key
bun api.ts                               # :3001 proving API for the frontend
forge test                               # 112 checks incl. ingest + wash suites
```

Reproduce the live system with `cast` (Safe and threshold from
`contracts/DEPLOYMENTS.md`):

```bash
cast call $SAFE "getThreshold()" --rpc-url $CREDITCOIN_RPC_URL        # 2
cast call $SCORE "getScore(<wallet>)" --rpc-url $CREDITCOIN_RPC_URL
```

## 6. Limits, stated plainly

- The interface exposes **batch** `verifyAndEmit`/`verify` overloads; our
  registry's `execute()` proves **one transaction per call** today. Batching is
  the known ~4× gas lever, not a shipped path.
- Proofs cover **height, not time**: wall-clock tenure derives from
  owner-anchored `chainAnchors`, falling back to import time without one
  (`creditScore.sol:505`). Anchors are Safe-owned data, not protocol truth.
- `sources`, token decimals, and USD prices are **owner-curated** (2-of-3 Safe):
  new markets need registration, WETH-class assets need pushed prices. Misses
  revert loudly by design — availability depends on curation keeping up.
- Score state lives in one registry's mappings: new source chains need no
  redeploy, but brand-new market *kinds* need a contract change.
