# TEST.md — Indenture credit suite

91 checks, 0 failing, ~100ms. Every claim below fails if you break it.

```bash
cd contracts
forge build   # 26 files, scripts included
forge test    # full suite
forge test --match-contract IngestTest -vvv   # one file, full traces
```

## Why this shape

The score contract verifies through Creditcoin's block-prover precompile
(`0xFD2`), which does not exist outside Creditcoin. So the suite splits in two:

- **`test/Harness.sol`** — `ScoreHarness` exposes the internals; `TxBuilder`
  builds byte-exact `EvmV1Decoder` type-2 payloads. Ingest tests run the real
  decoder + real scoring from synthetic receipts. The only untested seam is the
  precompile call itself (proves inclusion, not logic).
- Everything else tests pure math and mock flows directly.

## What each file pins

| File | Checks | Pins |
|---|---|---|
| `ScoreMath.t.sol` | 8 (5 unit + 3 fuzz) | Points brackets per dollar tier, $0.001 dust line, 900 cap, decimals normalisation, points ≤ 50, monotonic, cap-safe |
| `TierStake.t.sol` | 15 (14 + 1 fuzz) | Default 600/Bronze, $100→Silver, $100×10 wash stalls at 450/Silver (never Platinum), $1000+3 venues→Platinum, Gold needs 2 venues, default caps at Gold, −20/−60/−120 brackets, 400 floor, 900 cap, counter saturation, interest/collateral follow tier, high-water max, zero/venue-less no-ops |
| `Ingest.t.sol` | 27 | Aave repay→score+capacity+venue, dust leaves no ghost profile, `UnknownReserve`/`UnknownPrice` reverts, matched flash pair ignored, cross-pool refinance scores, multi-repay accumulates, small/large liquidation penalties, Compound supply/absorb/withdraw paths, facility score-only + small default, pause/unpause + owner-only, unknown action, failed source tx, empty tx, all `setPrice` guards, anchor guards, age oldest-wins + no-anchor fallback, same-asset refinance still flags (documented), different-user borrow scores, malformed borrow reverts, unknown absorb collateral reverts, foreign borrow-shape can't torch facility repay |
| `Integration.t.sol` | 6 | Gold terms through the live registry, frozen rate survives downgrade, pool pause matrix (funding stays open), pool ownership handover, stray ETH bounces, exact liquidation refund math |
| `Invariants.t.sol` | 3 | Score stays in [400, 900], max ≤ sum, terms in-bounds — under 32×5 random call soup |
| `LoanFacility.t.sol` | 10 (8 + 2 fuzz) | Self-custody open, zero rejects, partial/full repay, stranger-pays-borrower-earns, unknown/closed/overpay rejects, default only when due + once, post-default settlement, repay never exceeds principal, due-date overflow bounds |
| `MainLoanFacility.t.sol` | 9 | Borrow locks/pays, thin-collateral and empty-pool rejects, 18%-on-$100 yearly interest via warp, interest-first repay + full close, withdraw health gate, time-driven liquidation to pool, healthy-liquidation revert, owner-only seeding |
| `AdminToken.t.sol` | 8 (7 + 1 fuzz) | Owner-only mint, allowance flow, owner-only setters, reserve onboarding end-to-end, supply conservation, multisig handover + zero-guard, price cap boundary |
| `RealReceipt.t.sol` | 4 | Real mainnet logs through the real decoder (see below) |
| `VolumeProof.t.sol` | 3 | 40-repay × 5-liquidation volume run (see below) |

## Volume run + proof.json (40 repays, 5 liquidations)

`VolumeProofTest` ingests 45 independent transactions across
Aave/Spark/Compound × USDC/USDT — $25…$1000 repays plus one liquidation per
bracket (−20/−60/−120) — and asserts the aggregates: $20,500 summed capacity,
$1000 high-water max, score capped at 900, all 3 venues, 5 defaults, Gold
ceiling, and the 400 floor binding mid-run.

`test_volume_proofJson` additionally writes **`proof.json`** (repo root of
`contracts/`): an array of 45 `{txn, protocol, proofbody}` records, where
`protocol` is `aave`/`spark`/`compound` and `proofbody` is the hex-encoded
proof payload that was ingested. Regenerate anytime: `forge test
--match-contract VolumeProofTest`. Verify any entry by decoding `proofbody`
against `EvmV1Decoder`, or cross-check real-log entries via `cast receipt`.

## Ground truth (real chain data, not synthetic)
`test/fixtures/` holds exact log fields fetched from Ethereum mainnet:

- `aave-repay.json` — Aave V3 `Repay`, 81.770675 USDT self-repay, block 25749456, tx `0x743c…adaab` → scores +16, capacity $81.77.
- `compound-supply.json` — cUSDCv3 `Supply`, 1000 USDC, block 25940868, tx `0x0d00…8edb` → scores +50, capacity $1000.

Tests assert our event hashes equal the chain's topic0s, then score both receipts
exactly. Envelope chunks are synthetic (the decoder ignores them for scoring);
every topic, address, and amount byte is mainnet ground truth. Cross-check any
fixture: `cast receipt <txHash> --rpc-url <mainnet>`.

## Calibration anchors (change these numbers → tests shout)

- Wash: $100×10 = 450 stake, Silver ceiling. Real $1000 + 3 venues = Platinum.
- Penalties: ≤$50 → −20, ≤$1000 → −60, above → −120. Floor 400, ceiling 900.
- Pool: $100 @ 18% Bronze ≈ $18/year simple; liquidation keeps the pool whole.

## Known limits (stated, not hidden)

1. Precompile verification itself is untested locally — needs a Creditcoin fork.
2. Fork tests replaying full receipts (not just logs) are the next rung.
3. Invariant runs are trimmed (`runs = 32, depth = 5`) for speed; raise them in CI.
4. `script/` needs `SEPOLIA_RPC_URL` / `CREDITCOIN_RPC_URL` and a funded key; untouched by this suite.

## Frontend ABIs

`../app/lib/abi.ts` (`creditScoreAbi`, `loanPoolAbi`, `loanFacilityAbi`,
`mockUSDCABI`) is generated from `out/` — never hand-edit. Regenerate after
any contract change:

```bash
cd contracts && forge build && bun -e '
import { readFileSync, writeFileSync } from "fs";
const load = (p) => JSON.parse(readFileSync(p, "utf8")).abi;
const abi = {
  creditScore: load("out/creditScore.sol/OnChainCreditScore.json"),
  loanPool: load("out/MainLoanFacility.sol/MainLoanFacility.json"),
  loanFacility: load("out/LoanFacility.sol/LoanFacility.json"),
  mockUSDC: load("out/MockUSDC.sol/MockUSDC.json"),
};
let out = "// AUTO-GENERATED from contracts/out — do not hand-edit. Regenerate with the bun one-liner in TEST.md.\n";
for (const [name, a] of Object.entries(abi)) out += `export const ${name}Abi = ${JSON.stringify(a)} as const;\n\n`;
writeFileSync("../app/lib/abi.ts", out);'
```
