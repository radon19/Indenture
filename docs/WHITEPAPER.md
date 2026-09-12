# Indenture: Portable On-Chain Credit from Attested Repayment History

**Version 1.0 — September 2026 · Status: live on Creditcoin testnet**
**Author: Kedar Singh Naikane · Live: https://indenture.vercel.app**

---

## Abstract

Credit is history plus enforcement, and blockchains have perfect history with
no portability: a borrower with years of perfect Aave repayments looks
identical to a fresh wallet on every new chain, so every lender demands
overcollateralization. Indenture makes repayment history **portable**
(cross-chain attestations), **verifiable** (precompile-checked inclusion, not
trusted reporters), and **priced** (score → tier → loan terms, all on-chain).
Anyone can prove history for anyone; proofs verify or revert; scores blend
depth over volume so washing is uneconomic; a lending pool prices tiers down to
90% collateral at 5% APR. Every claim in this paper resolves to deployed code
or a reproducible test — paths and addresses in §10.

---

## 1. Problem

1. **Disclosure failure, not model failure.** Undercollateralized lending dies
   because lenders cannot see borrower history, not because scoring math is
   unknown.
2. **Self-reported history is worthless.** Any scheme that trusts the borrower
   (or a single oracle) to state their past collapses to forgery or bribery.
3. **Capital is venue-locked.** Repayment on Ethereum mainnet earns nothing on
   Creditcoin, Base, or anywhere else — good behavior is taxed, bad behavior
   is free to restart elsewhere.

## 2. Design principles

- **P0 — Anyone can prove anything about anyone.** The borrower is read from
  indexed log topics, never from `msg.sender`. There is no submitter
  allowlist to bribe, capture, or DDoS; hidden liquidations get filed by
  whoever finds them.
- **Verify, don't trust.** No oracles deliver numbers. The score is computed
  inside the EVM of the chain that verified the evidence, from events that
  chain checked for itself.
- **Fail loud.** Unknown token, missing price, unregistered market, malformed
  topics, paused registry — all revert *before* consuming the proof, so every
  failure is retryable after registration. Nothing burns, ever.
- **Paper never outranks chain.** Exports and receipts are unsigned statements
  with live verify links; every claim re-derives from registry reads.

## 3. System architecture

**Actors:** borrowers, permissionless reporters (lenders, competitors, bots),
the 2-of-3 Safe (owner of all contracts), lenders via the pool.

**Components:**

| Component | Role | Deployment |
|---|---|---|
| `OnChainCreditScore` | Registry: verifies, scores, tiers, prices | Creditcoin `0xFA19…237` |
| `MainLoanFacility` | Pool: CTC in, mUSDC out, tier terms | Creditcoin `0x5e78…D4d` |
| Proving worker | Receipt check, log summary, proof build | Railway, keyless API mode |
| Evidence store | Postgres mirror: one row per proven tx | Supabase, deduped by hash |
| Frontend + receipts | Score, borrow, evidence explorer, proofs of record | Vercel |

**Sources** (internal keys): `3` = Ethereum mainnet (Aave V3 `0x8787…4E2`,
Spark `0xC13e…987`, Comet USDC/USDT), `1` = Sepolia (LoanFacility ledger
`0xbdf4…8387`).

## 4. Attestation layer

Source transactions are proven with Merkle inclusion plus chain-continuity
proofs checked synchronously by the native block-prover precompile (`0xFD2`).
The registry is an ASCBase Application Smart Contract: `execute()` derives a
query id from `(chainKey, blockHeight, txIndex)`, rejects replays (`"Query
already processed"`), runs `verifyAndEmit`, marks the query, then dispatches
to scoring. The precompile proves **inclusion and continuity only** — tx
success, source registration, reserve registration, and flash-loan analysis
are the registry's job, each pinned by a failing-if-removed test. Full
protocol treatment: `docs/ATTESTCOIN_PROTOCOL.md`.

## 5. Scoring model

All values 18-decimal USD unless noted. State per wallet: `score` (uint16),
`capacity18` (lifetime volume), `maxRepayment18` (biggest single),
`venues` (bitmask 1/2/4), `defaults` (saturating uint16), `oldestActivity`.

**Repayment points** `getPoints(amount18)`: `< $0.001 → 0 (dust, exits before a
profile is born)` · `< $0.01 → +1` · `< $0.10 → +2` · `< $1 → +4` ·
`< $10 → +8` · `< $100 → +16` · `< $2,500 → +32` · `≥ $2,500 → +50`.
Score clamps to `[400, 900]` from a 600 default.

**Tiers** read blended stake `maxRepayment18 + 35% × capacity18`:

| Tier | Stake | Venues | Collateral | APR |
|---|---|---|---|---|
| Bronze | — | — | 150% | 18% |
| Silver | ≥ $100 | ≥ 1 | 130% | 12% |
| Gold | ≥ $100 | ≥ 2 | 110% | 8% |
| Platinum | ≥ $1,000 | ≥ 3 | 90% | 5% |

Any default caps the wallet at Gold. `$100 repaid 10×` stalls at 450 stake;
a real `$1,000` single repayment clears 1,350 — depth beats photocopying.

**Defaults** scale by severity: `≤ $50 → −20`, `≤ $1,000 → −60`, `> $1,000 →
−120`, floor 400. APR rises +2% per default, capped at 25%.

**Tenure:** proven history older than 30 days earns +10, read live with the
900 ceiling. `oldestActivity` is downward-only — older proofs help, newer
ones cannot inflate it.

**Flash loans:** borrow+repay sharing emitter, coin, and user in one receipt
prove no capacity. Cross-venue and external-capital wash are acknowledged
bounds (see §8), contained by the stake blend, not closed.

## 6. Lending pool

`borrow(debt)` locks CTC against `quoteCollateralWei` at the live tier and
snapshots the rate; `repay` covers banked interest first, then principal, and
caps overpays at owed; `withdrawCollateral` requires the tier ratio to hold;
`liquidate` is permissionless past the health line (debt *plus* accrued
interest), seized collateral stays in the pool with excess refunded to the
wei. Five money paths, all pausable; funding stays open under pause. Pinned by
warp-driven tests including refund math.

## 7. Receipts and evidence

The off-chain mirror is a convenience, never a trust root: one Postgres row
per proven tx (unique hash), a singleton global counter, filing atomic
(create-first, conflict falls back to update) so concurrent proofs can't
double-count. Reads degrade to a static floor instead of 500ing. Per-wallet
Proofs of Record restate score, tier, and filed proofs with live verify links;
the statement is unsigned by design.

## 8. Security analysis

Solved and live: forged history (attestor set is the test), photocopied
capacity, same-triple flash loans, ledger griefing (wei-scale penalties,
settleable debt), fail-loud ingestion (GHO/weETH liquidations bounced, were
registered in two casts each, ingested on retry), dust/replay/overflow
(time-tested saturating counters), pool economics to the wei.
Deferred on purpose: timelock in front of the Safe, continuous liquidation
poller with mainnet sources. Genuinely unsolved, field-wide: enforcement
(walk-away costs score only), slow wash (duration-weighting specified,
unbuilt), oracle-free foreign-asset truth (owner-pushed prices with locks and
bounds, stated not faked), external flash capital. Verified today: 112/112
forge checks, 12/12 worker checks, green production build.

## 9. Roadmap

Batched ingest (the ~4× gas lever) · backfill reconciliation · continuous
poller · timelock · duration-weighted capacity · professional audit before any
real value touches the pool.

## 10. References

- Registry / pool / stable: `0xFA19…237` / `0x5e78…D4d` / `0xFdCD…d39`
  (Creditcoin 102031); Safe `0x0574…F240` (2-of-3, threshold verifiable by
  `cast call $SAFE "getThreshold()"`)
- `contracts/SECURITY.md` — solved · deferred · unsolved with reproduction
- `docs/ATTESTCOIN_PROTOCOL.md` — precompile-to-scoring integration spec
- `contracts/TEST.md` — suite map; `contracts/proof.json` — 45-tx volume run
- Live app: https://indenture.vercel.app · Code: https://github.com/radon19/Indenture
