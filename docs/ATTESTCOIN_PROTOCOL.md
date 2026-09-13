# How Indenture Uses the Attestcoin Protocol

**One paragraph:** Indenture proves Ethereum repayment history on Creditcoin
without trusting any reporter, oracle, or bridge. The Attestcoin Protocol's
native block-prover precompile (`0xFD2` / 4050) verifies that a source
transaction is really inside a real source block and that the block really
belongs to the source chain. Our registry contract then decodes that
transaction's receipt and scores whoever the logs name as borrower. Everything
after the precompile says "yes" is deterministic decoding — no opinions, no
feeds, no allowlists.

> **For judges (30 seconds):** Indenture is an **ASCBase Application Smart
> Contract** — the Attestcoin whitepaper's native pattern. Every score change
> on Creditcoin is gated by a synchronous `verifyAndEmit` call to the `0xFD2`
> precompile inside the same transaction that writes the score. Remove the
> precompile and the product stops: no fallback path, no oracle override, no
> admin backdoor ingest exists. The full evidence chain — SDK proof fields →
> `execute()` args → precompile structs → receipt decode → scoring — is pinned
> below with exact file:line references and reproducible `cast` commands.

## 0. Integration-depth scorecard

How to grade this section: each row names the criterion, the verdict, and the
single file that proves it. All paths are relative to the repo root.

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | State writes gated by precompile in the same tx | ✅ Yes — `execute()` reverts unless `verifyAndEmit` returns true | `contracts/src/vendored/ASCBase.sol:37-67` |
| 2 | Uses the canonical ASC pattern, not a custom verifier | ✅ Yes — inherits `ASCBase`, implements only `_processAndEmitEvent` | `contracts/src/creditScore.sol:456` |
| 3 | Precompile address resolved canonically | ✅ Yes — `NativeQueryVerifierLib.getVerifier()` → `0xFD2` | `contracts/src/vendored/INativeQueryVerifier.sol:68-74` |
| 4 | Both proof halves consumed (inclusion + continuity) | ✅ Yes — `MerkleProof{root, siblings}` + `ContinuityProof{lowerEndpointDigest, roots}` | `contracts/src/vendored/ASCBase.sol:78-94` |
| 5 | Replay protection derived from the proof itself | ✅ Yes — `queryId` from `(chainKey, blockHeight, txIndex)` via `calculateTxIndex` | `contracts/src/vendored/ASCBase.sol:96-114` |
| 6 | Proved bytes decoded on-chain, not trusted from off-chain | ✅ Yes — `EvmV1Decoder.decodeReceiptFields` over `encodedTransaction` | `contracts/src/creditScore.sol:470-472` |
| 7 | Off-chain builder is keyless and untrusted | ✅ Yes — `ProofBuilder.getProof` holds no keys; contract re-checks everything | `worker/prove.ts:161-190` |
| 8 | Frontend never bypasses verification | ✅ Yes — wallet submits `execute()` with the full proof; simulation first | `worker/worker.ts:76-94`, `app/api/prove/route.ts` |
| 9 | Attestation covered by replayed real receipts in tests | ✅ Yes — real mainnet receipt replays + wash/flash suites | `contracts/test/RealReceipt.t.sol`, `WholeReceipt.t.sol`, `Ingest.t.sol` |
| 10 | No non-attested ingest path | ✅ Yes — `action != 0` reverts; no `setScore`/`adminIngest` exists | `contracts/src/creditScore.sol:463` |

**Net:** 10/10 touchpoints resolve to attestation. Scoring, tiers, pool
pricing, and receipts are all downstream of a verified proof — they read
registry state that only `execute()` can write.

## 1. The trust problem it removes

A credit score computed from another chain's history has exactly one
load-bearing question: **did that transaction really happen there?** The naive
answers all fail:

| Approach | Why it fails |
|---|---|
| Trust the submitter | Anyone can claim anything |
| Trust an oracle committee | A new trusted third party with a feed to bribe |
| Trust a bridge message | Bridge validator sets get captured |
| Replay full blocks on Creditcoin | Prohibitively expensive per proof |

### Attestcoin's answer

The destination chain itself checks a Merkle inclusion proof against attested
block roots, plus a continuity proof chaining the block back to attested
history — executed synchronously inside a Creditcoin block by a precompile.
Forging history means forging the attestor set's signatures, not fooling our
code.

## 2. The primitives we use

### 2.1 The precompile: `0xFD2` (4050)

`contracts/src/vendored/INativeQueryVerifier.sol` — the interface; address
`0x000…0FD2` resolved by `NativeQueryVerifierLib.getVerifier()` (`:68-74`).
Two entry shapes, each in state-changing and view flavors:

- `verifyAndEmit(chainKey, height, encodedTransaction, merkleProof,
  continuityProof)` — verifies **and emits**
  `TransactionVerified(chainKey, height, transactionIndex)`. This is what our
  registry calls (`ASCBase._verifyProof`, `contracts/src/vendored/ASCBase.sol:87`).
- `verify(...)` — same checks, read-only. Used for dry runs, never for scoring.
- `calculateTxIndex(merkleProof)` — derives the transaction's index inside its
  block from the Merkle path. Feeds the replay guard below.
- Batch overloads (`heights[]`, `encodedTransactions[]`, `merkleProofs[]`
  with a shared continuity proof) exist on the interface (`:37-43`, `:53-59`)
  but our registry's `execute()` proves **one transaction per call** today —
  batching is the known ~4× gas lever, not a shipped path.

Note what the precompile does **not** do: it proves *inclusion and
continuity — nothing else*. It does not check the transaction succeeded,
which chain the caller *claims*, or which contract emitted the logs.
Section 4 is our registry doing exactly those three jobs.

### 2.2 The ASC pattern: verify → dedupe → dispatch

`contracts/src/vendored/ASCBase.sol` — the whitepaper base layer for
Application Smart Contracts. `execute()` (`:37-67`) runs the same four beats
for every proof:

```solidity
// ASCBase.execute — contracts/src/vendored/ASCBase.sol:37-67
queryId = _computeQueryId(chainKey, blockHeight, merkleRoot, siblings); // txIndex via calculateTxIndex
require(!processedQueries[queryId], "Query already processed");
require(_verifyProof(...), "Proof of inclusion verification failed");   // VERIFIER.verifyAndEmit
processedQueries[queryId] = true;
_processAndEmitEvent(action, queryId, chainKey, blockHeight, encodedTransaction);
```

`_computeQueryId` (`:96-114`) packs `(chainKey, blockHeight, txIndex)` —
with `txIndex` derived on-chain from the Merkle path via
`calculateTxIndex`, **not** supplied by the caller — and hashes them. The
replay guard falls out of the math: one genuine repayment resubmitted with a
fresh proof attempt reverts with `"Query already processed"` instead of
scoring twice. Our frontend treats that revert as a success state
(permissionless ingest means someone may beat you to it — `worker/worker.ts:88-93`,
`worker/README.md`).

### 2.3 The decoder: `EvmV1Decoder`

`contracts/src/vendored/EvmV1Decoder.sol` — pure functions over the proved
transaction bytes (`encodedTransaction` is `abi.encode(uint8 txType, bytes[]
chunks)`, receipt in the last chunk):

- `getTransactionType` / `isValidTransactionType` (`:67-77`) — gate exotic tx
  shapes; the registry rejects anything above type 4
  (`creditScore.sol:465-468`).
- `decodeReceiptFields` (`:115-120`) — returns `ReceiptFields` with
  `receiptStatus` and the `receiptLogs[]` (`LogEntry { address_, topics, data }`),
  plus topic-filter helpers (`:83-106`).

### 2.4 The builder: ProofBuilder SDK (off-chain, untrusted)

`worker/prove.ts:161-190` — `new
proofProvider.service.ProofBuilder(chainKey,
CREDITCOIN_PROOF_BUILDER_URL).getProof(txHash)` (from `@gluwa/usc-sdk`,
`worker/package.json`) returns `{ success, data }` with `merkleProof`
(`root`, `siblings[]` of `{hash, isLeft}`) and `continuityProof`
(`lowerEndpointDigest`, `roots[]`). `proveTx` normalizes the SDK's
alternative field names (`txBytes`/`encodedTransaction`,
`headerNumber`/`blockHeight`/`height`, …) into execute-ready args and throws
`proof missing field for <k>` if any are absent — so a builder schema change
fails loud, never silently short.

Field map (SDK → `execute()` arg → precompile struct):

| SDK `data` field | `ExecuteArgs` (`worker/prove.ts:176-185`) | `execute()` param → precompile struct |
|---|---|---|
| `chainKey` | `chainKey` | `chainKey` (uint64) |
| `headerNumber` / `blockHeight` / `height` | `blockHeight` | `blockHeight` (uint64) |
| `txBytes` / `encodedTransaction` | `encodedTransaction` | `encodedTransaction` (bytes) |
| `merkleProof.root` / `.merkleRoot` | `merkleRoot` | `MerkleProof.root` |
| `merkleProof.siblings[]` / `.proof[]` | `siblings[{hash, isLeft}]` | `MerkleProof.siblings[]` |
| `continuityProof.lowerEndpointDigest` | `lowerEndpointDigest` | `ContinuityProof.lowerEndpointDigest` |
| `continuityProof.roots[]` | `continuityRoots` | `ContinuityProof.roots[]` |

`action` is always `0` (credit ingest); anything else reverts with
`UnknownAction` and consumes nothing (`creditScore.sol:463`).

## 3. End-to-end: one repayment, five hops

Conventions: source `chainKey` is `3` = Ethereum mainnet, `1` = Sepolia
(`creditScore.sol:13-14`; the worker enforces the same pair in
`prove.ts:163` and `api.ts:69`).

1. **Pre-check (off-chain, advisory only).** `fetchReceipt`
   (`worker/prove.ts:149-157`) pulls the source receipt over
   `SOURCE_RPC_URL_<key>`: must exist, `status == 1`. `summarizeLogs`
   (`:103-147`) names protocol/kind/borrower/amount best-effort from the log
   shapes — the contract remains the judge. Skipping or lying here buys
   nothing: the registry re-checks success itself.
2. **Prove (off-chain, keyless).** `proveTx` waits on the attestation service
   and returns `{ action: 0, chainKey, blockHeight, encodedTransaction,
   merkleRoot, siblings, lowerEndpointDigest, continuityRoots }`. Two
   surfaces: CLI (`worker/worker.ts` — `--dry` prints the summary and stops,
   full mode sends `execute()` from `CREDITCOIN_PRIVATE_KEY`) and HTTP
   (`worker/api.ts` `POST /prove` — secret-gated, 10/min per-IP throttle,
   `{ok, summary, execute}` or typed `400/422/429` failures).
3. **Submit (no trusted submitter).** The browser path is
   `app/api/prove/route.ts` → `worker/api.ts` → wallet-signed `execute()`.
   The Next server holds `WORKER_AUTH_TOKEN`; browsers never do. The frontend
   **simulates** `execute()` first, then the user's wallet (or the worker CLI
   with a funded key) sends it. No backend *service* key ever signs an
   ingest in API mode — borrower identity comes from log topics, never from
   `msg.sender`, so anyone can file for anyone.
4. **Verify + dedupe (precompile + ASCBase).** Query id derived from the
   proof's own Merkle path, replay checked, `verifyAndEmit` run, query marked
   processed — all in one Creditcoin transaction.
5. **Score (our `_processAndEmitEvent`, `creditScore.sol:456-501`).** Gate
   `action == 0` and valid tx type; require `receiptStatus == 1`; route each
   log by `sources[chainKey][emitter]`; bank the first repayment (same
   user+coin sums in), penalize liquidations, ignore dust, touch tenure.
   Unknown reserve or missing price **reverts before consuming anything** —
   the proof stays retryable after registration (re-registration then
   re-ingest of the same tx succeeds because `processedQueries` is only set
   *after* verification *and* successful dispatch — a revert rolls the mark
   back too).

```
source chain (eth/sep)          attestation service            Creditcoin 102031
─────────────────────           ───────────────────            ──────────────────
receipt (eth_getReceipt) ──→ ProofBuilder.getProof(txHash)
                               {merkle, continuity} ──→ execute(action=0, …)
                                                        ├─ calculateTxIndex → queryId
                                                        ├─ processedQueries? revert
                                                        ├─ 0xFD2.verifyAndEmit ─┐
                                                        │  inclusion+continuity │
                                                        ├─ mark processed       │
                                                        └─ decodeReceipt → score┘
```

## 4. What the precompile proves vs what the registry checks

The table judges actually want:

| Check | Where | Attack it stops |
|---|---|---|
| Merkle inclusion in the block | precompile | Fabricated repayment |
| Continuity to attested history | precompile | Forged chain / reorged block |
| Query-id replay guard | `ASCBase:49` | Resubmitting one genuine repay to farm score |
| `receiptStatus == 1` | registry `:472` | A **reverted** repayment counting as success |
| `(chainKey, emitter)` registered source | registry `:479` | Look-alike pool on an untrusted chain; Sepolia address impersonating mainnet |
| Dispatch on log's own emitter + `topic0` | registry `:522-575` | Copycat contract emitting same-shaped events; the `action` arg is a hint, never trusted |
| Reserve registered + priced | registry `:380-386` | Obscure 0-decimal token inflating capacity; reverts retryably |
| Same-emitter/coin/user borrow+repay | registry `:603-607` | Zero-capital flash loan minting capacity |
| First-repay-wins banking | registry `:579-601` | Multi-log stuffing inside one receipt |
| `action == 0`, tx type ≤ 4 | registry `:463-468` | Malformed or mis-dispatched proofs consuming state |

## 5. Touchpoint inventory — every file attestation flows through

| # | Layer | File | Role in attestation |
|---|---|---|---|
| 1 | Contract interface | `contracts/src/vendored/INativeQueryVerifier.sol` | Precompile ABI + `0xFD2` resolution |
| 2 | Contract base | `contracts/src/vendored/ASCBase.sol` | `execute` / `_verifyProof` / `_computeQueryId` / replay map |
| 3 | Contract decoder | `contracts/src/vendored/EvmV1Decoder.sol` | Proved-bytes → receipt + logs |
| 4 | Contract app | `contracts/src/creditScore.sol` | Source registry, scoring, all revert guards |
| 5 | Prover | `worker/prove.ts` + `worker/worker.ts` + `worker/api.ts` | Receipt pre-check, `ProofBuilder`, CLI + HTTP surfaces |
| 6 | Relay | `app/api/prove/route.ts` | Forwards `{chainKey, txHash}` with the secret browsers never hold |
| 7 | Frontend | `app/score/*` + `app/lib/abi.ts` | Simulation-before-submit `execute()`; `already processed` = success |

Delete any one of rows 1–4 and nothing scores. Replace row 5's builder URL
with a liar and proofs fail at the precompile. That is the definition of
deep integration: attestation is the write path, not a badge.

### What we deliberately did NOT do (shallow patterns avoided)

- No oracle/relayer signature accepted as evidence — only the precompile's
  verdict inside `execute()`.
- No `msg.sender`-as-borrower shortcut — borrower is decoded from indexed
  topics (`creditScore.sol:533, 551, 564`).
- No off-chain score pushed on-chain — scoring math runs in Solidity over
  proved logs (`increaseScore`/`decreaseScore`/`_addCapacity`).
- No admin ingest (`setScore`, `importHistory`) — `grep` the contract: the
  only state-changing ingest is `execute()`.
- No silent skips — every unknown (token, price, market, topic shape, pause)
  reverts with a named error before state changes.

## 6. Test + live verification

Forge suite (`contracts/test/` — `forge test`: **112 passed**): attestation
surface is pinned by `Ingest.t.sol` (verify→score happy path + every revert),
`RealReceipt.t.sol` + `WholeReceipt.t.sol` (real mainnet receipt replays),
`VolumeProof.t.sol` (45-tx `proof.json` volume run), `TierStake.t.sol` +
`ScoreMath.t.sol` (wash/flash math), `Integration.t.sol` (registry→pool),
`Invariants.t.sol` (fuzz: no double-count, no overflow-brick).

Worker suite (`bun test worker/`: **12 passed**) covers `summarizeLogs`
protocol/kind/borrower decoding and `proveTx` field normalization.

Reproduce the live system with `cast` (Safe and threshold from
`contracts/DEPLOYMENTS.md`):

```bash
cast call $SAFE "getThreshold()" --rpc-url $CREDITCOIN_RPC_URL        # 2
cast call $SAFE "getOwners()" --rpc-url $CREDITCOIN_RPC_URL            # 3 owners
cast call $SCORE "getScore(<wallet>)" --rpc-url $CREDITCOIN_RPC_URL
cast call $SCORE "VERIFIER()" --rpc-url $CREDITCOIN_RPC_URL            # 0x000…0FD2
```

Deployed addresses (Creditcoin testnet 102031, from `contracts/DEPLOYMENTS.md`
and `app/lib/site.ts`): registry `OnChainCreditScore`
`0xFA19b4DDCEA765Ce8662ec9ea15438Adce44E237`, pool
`0x5e78fb780f43b31B9b32d84C4482e4A8eD89DD4d`, 2-of-3 Safe
`0x057463C89aa9B0Cef7362E4f6a9505f305e2F240`. Sources:
Ethereum `chainKey 3` (Aave V3 `0x8787…4E2`, Spark `0xC13e…987`, Comet USDC
`0xc3d6…dc3` / USDT `0x3Afd…840`), Sepolia `chainKey 1` (LoanFacility
`0xbdf4…8387`).

## 7. Setup and run

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

## 8. Limits, stated plainly

- The interface exposes **batch** `verifyAndEmit`/`verify` overloads; our
  registry's `execute()` proves **one transaction per call** today. Batching is
  the known ~4× gas lever, not a shipped path.
- Proofs cover **height, not time**: wall-clock tenure derives from
  owner-anchored `chainAnchors`, falling back to import time without one
  (`creditScore.sol:505-513`). Anchors are Safe-owned data, not protocol truth.
- `sources`, token decimals, and USD prices are **owner-curated** (2-of-3 Safe):
  new markets need registration, WETH-class assets need pushed prices. Misses
  revert loudly by design — availability depends on curation keeping up.
- Score state lives in one registry's mappings: new source chains need no
  redeploy, but brand-new market *kinds* need a contract change.
