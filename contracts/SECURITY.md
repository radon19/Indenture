# SECURITY — Indenture credit

Undercollateralized lending dies on disclosure failure, not model failure.
This document states what is solved and live, what is deliberately deferred
and why, and what nobody in the field has solved — before anyone else has to.
Every solved claim maps to tests in `TEST.md`; reproduce with `forge test`
(112 checks green).

## P0 — Anyone can prove anything about anyone

Ingestion is permissionless by design, and the borrower is always read from an
**indexed topic**, never from `msg.sender`. A liquidation the borrower hides
can be submitted by a lender, a competitor, or a bot — and every additional
reporter makes the record more accurate, not noisier, because proofs verify or
they revert. Volume adds coverage without adding forgery. There is no
submitter allowlist to bribe, capture, or DDoS, and the frontend's Check →
Submit flow plus the worker CLI are two doors into the same permissionless
`execute()`.

## What we solved (shipped, tested, live on testnet)

### S1 — Forged history: impossible by construction
Fabricated repayments need a forged Merkle + continuity proof against the
attestor set. The precompile is the test; no test of ours can cover it, and
none needs to.

### S2 — Photocopied capacity ($100 repaid 10×)
Tiers read `stake = maxRepayment + 35% × lifetimeVolume`, never the sum.
$100×10 stalls at 450 stake; a real $1000 single repayment clears 1350.
Pinned by `test_wash100x10NeverReachesPlatinum`.

### S3 — Flash-loan capacity (zero capital, one transaction)
Capacity is denied only on an identical `(emitter, coin, user)` borrow/repay
pair, so honest same-tx refinancing scores in full while an 8M-borrow/8M-repay
pair grants nothing. Multi-repay transactions accumulate instead of
last-wins. Pinned by `test_flashPair_*`, `test_honestRefinance_*`,
`test_multiRepay_*`, `test_sameAssetRefinance_stillFlags`.

### S4 — Mock-ledger griefing (the 1-wei default)
The Sepolia ledger is self-open only (consent by construction), defaults
require `block.timestamp >= dueAt` for everyone, penalties scale with dollars
(−20/−60/−120), and debt stays settleable after default. Post-due marking by
anyone is truthful — the chain clock proves lateness — which is P0 working.

### S5 — Fail-loud ingestion
Unknown token, missing price, unregistered market, malformed topics, paused
registry: all revert *before* consuming the proof, so every failure is
retryable after registration. Proven live, not just in tests — the first real
GHO and weETH liquidations bounced exactly this way, were registered with two
casts each, and ingested on retry. Nothing burns, ever.

### S6 — Dust, replays, overflow bricks
Sub-dust repays exit before a profile is born (no ghost armies). One source
transaction ingests once; failures revert before marking. Counters saturate
instead of bricking griefed addresses. Pinned across `ScoreMath`,
`TierStake`, and `Ingest` suites.

### S7 — Real pool economics
Interest accrues and is charged (interest-first repayments), health counts
debt *plus* interest so time can actually liquidate, seized collateral stays
in the pool with excess refunded, stray ETH bounces, all five money paths
pause while funding stays open. Pinned with warp-driven tests, including
refund math to the wei.

### S8 — Provenance you can re-derive
Real mainnet receipts replayed byte-for-byte (`RealReceiptTest`, whole-receipt
suites), a 45-transaction volume run committed as `proof.json`, live evidence
rows in Postgres behind the evidence tab (deduped by tx hash, global counter),
and per-row explorer links. A judge needs only `cast` to check our work.

### S9 — Tenure pays the patient
`oldestActivity` accrues from proof-covered heights, and `getScore` adds a
flat +10 past 30 days of seasoning, hard-capped with the 900 ceiling. Old
honest wallets outrank fresh farmed ones with identical money.

### S10 — Multisig is live, not planned
Official Safe v1.4.1 bytecode compiled from source and deployed (the chain
carries no canonical set, and gates CREATE2 — so a CREATE-based deployer
launched the proxy atomically). All three app contracts answer to the 2-of-3
Safe; the handover is verified on-chain. Operator tooling (`worker/safe.ts`:
propose → collect → execute) ships with the repo.

### S11 — Paper that points back to chain
Printable receipts (`/receipt/[address]`, `GET /api/receipt?user=`) restate
score, tier, and filed proofs with live verify links per row — but the
statement is unsigned by design. The paper never outranks the chain: every
claim re-derives from registry reads and explorer transactions. Filing is
atomic (create-first, `P2002` falls back to update), so concurrent proofs of
the same transaction can't double-count the counter.

## Not implemented, on purpose (with reasons, not excuses)

### D1 — Timelock, not the vault
The 2-of-3 Safe is live and owns all three contracts (S10). What remains is
the delay in front of it: a timelock so even approved changes wait 24–48h in
public before executing.

### D2 — Continuous poller exists as a design, not a process
The worker proves on demand today; the poller that would auto-import every
liquidation is specified (10-minute rounds, prove→submit in one pass, snooze
instead of drop) but not running. Reason: on testnet the event surface is us;
a poller watching our own demo loans proves nothing and costs RPC quota we'd
rather spend on judging-day proving. It ships with mainnet sources.

## Not solved (genuinely hard — shared with the whole field)

1. **Enforcement.** A walk-away costs score only. No legal rails, no junior
   tranche, no stake to slash. Our math bounds the damage; it does not make
   anyone whole. Nobody has solved this trustlessly.
2. **Slow wash.** Borrow, hold, repay across blocks earns full credit for a few
   dollars of interest. The real fix is duration-weighting (debt × time) —
   specified, unbuilt, by us and everyone else.
3. **Hidden-history completeness.** P0 makes omission contestable; only
   continuous indexing (D2) makes it complete. Until then a score is a lower
   bound on badness.
4. **Foreign-asset truth without an oracle.** Owner-pushed prices with locks
   and bounds is our answer; a trust-minimised equivalent is an open problem
   we refuse to fake.
5. **External flash capital.** Same-tx guards cannot see money that entered
   from outside registered pools. No scorer closes this.

## Build next, in order

1. Continuous poller (D2) alongside first mainnet sources.
2. Timelock live (D1).
3. Duration-weighted capacity — the field's hardest open problem.
4. Professional audit before any real value touches the pool.
