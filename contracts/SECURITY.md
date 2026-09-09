# THREAT MODEL — Indenture credit

Undercollateralized lending dies on disclosure failure, not model failure.
This document states what is stopped, what is priced, and what is still open —
before anyone else has to. Every numbered threat maps to tests in `TEST.md`;
reproduce with `forge test`.

## P0 — Anyone can prove anything about anyone (the load-bearing principle)

Ingestion is permissionless by design, and the borrower is always read from an
**indexed topic**, never from `msg.sender` — which on this chain is just the
worker relaying the proof. Consequences, all intended:

- A liquidation the borrower hides can be submitted by a lender, a competitor,
  or a bot. Omission is **contestable**, and every additional reporter makes
  the record more accurate, not noisier: proofs verify or they revert, so
  volume adds coverage without adding forgery.
- A friend settling your debt builds *your* history, not theirs.
- There is no submitter allowlist to bribe, capture, or DDoS.

The precompile guarantees a proven event happened; this contract decides what
it *means* — registered `(chainKey, emitter)`, `receiptStatus == 1`, exact
topic0 match. Nothing else is trusted: the caller's `action`, the envelope
chunks, and any unregistered log are ignored or rejected.

## Stopped (attack costs more than it buys, or is impossible)

### T1 — Forged history
Fabricated repayments need a forged Merkle + continuity proof against the
attestor set. Impossible without breaking consensus itself. No test can cover
this; the precompile is the test.

### T2 — Photocopied capacity ($100 repaid 10×)
Tier reads `stake = maxRepayment + 35% × lifetimeVolume`, not the sum.
$100×10 → 450 stake (Silver at best, needs venues); a real $1000 single
repayment → 1350. Pinned by `test_wash100x10NeverReachesPlatinum`.
*Residual:* volume still contributes 35% — loyalty signal, priced deliberately.

### T3 — Flash-loan capacity (zero capital, one transaction)
Repay/ EMT borrow pairing requires identical `(emitter, coin, user)` triple
before capacity is denied, so honest same-tx refinancing scores in full while
an 8M-borrow/8M-repay pair grants nothing. Multi-repay txs accumulate instead
of last-wins. Pinned by `test_flashPair_*`, `test_honestRefinance_*`,
`test_multiRepay_*`.
*Residual:* flash capital from *outside* registered pools is invisible to any
same-tx guard (industry-wide blind spot, shared with every scorer), and a
same-asset refinance (repay USDC + borrow USDC, one tx) still flags — rare,
honest, mildly punished, pinned as accepted in
`test_sameAssetRefinance_stillFlags`.

### T4 — Mock-ledger griefing (the 1-wei default)
The Sepolia ledger is self-open only (consent by construction), defaults
require `block.timestamp >= dueAt` for everyone including any lender role, and
penalties scale with dollars (−20/−60/−120), so 1 wei of malice costs −20, not
a tier. Post-due marking by anyone is truthful — the chain clock proves
lateness — which is exactly the anyone-reports property of P0.

### T5 — Dust ghost armies
Sub-dust repays exit before profile initialization: 10,000 spam addresses stay
unborn instead of 10,000 clean 600s. Pinned by `test_dust_ignoredWithoutInit`.

### T6 — Replay / double-count
One source transaction ingests once (`processedQueries` in `ASCBase`); failed
proofs revert before marking, so legitimate retries survive while replays die.
Pause reverts the same way — nothing burns.

### T7 — Price corruption
USDC/USDT are immutable at $1 in code. Other pushes reject zero and anything
above $1M, emit `PriceSet`, and move under multisig (below). A typo'd WETH
price cannot silently mint trillionaires.

## Priced, not prevented (rational attackers decline; rich ones pay full fare)

### T8 — Slow wash (borrow, hold, repay across blocks)
Real interest + gas + locked capital per cycle, for full credit each time.
Five quiet cycles ≈ Platinum for under $50. No cheap fix exists — the real one
is duration-weighting (debt × time), which is first on the build-next list.
Until then the price, not a wall, is the defence.

### T9 — Hidden liquidations
Nobody must submit their own worst day. Mitigated by P0 (anyone else can) but
not closed; continuous indexing of registered sources is the scheduled fix.
A score is therefore a *lower bound on badness*, stated plainly.

### T10 — Savers score as repayers
Compound `Supply` cannot distinguish debt repayment from yield deposits. Both
lock real capital with a real counterparty, so both count — a whale parking
$1M for yield earns borrower status without borrowing. Bounded by the same
capital-at-risk logic as everything else.

## Trusted inputs (owned, disclosed, shrinking)

### T11 — Owner key
Prices (ex-stables), reserves, sources, anchors, pause — one key today.
Shrunk by: `transferOwnership` on all three contracts (tested handover),
stables unchangeable, price bounds, pause that never burns proofs. The pool
carries its own pause (all five money paths freeze, funding stays open so
rescue never needs unpausing first), ownership handover, and no receive
function — stray ETH bounces instead of locking silently.

Multisig status: code-ready, not yet live. The handover path is implemented
and tested, but app.safe.global does not list Creditcoin testnet, so there is
no Safe to hand to — raw EOA ownership is a conscious testnet-only posture
(no real funds at stake). Mainnet handover is: deploy 2-of-3 Safe, transfer
all three contracts, backend holds one seat. Timelock after that.

### T12 — Stale backend prices
No on-chain staleness tripwire can exist (the chain cannot know the world).
Mitigation is procedural: co-signed push schedule plus monitoring. A dead
backend freezes scoring truth at last-push values — fail-stale, documented.

### T13 — Anchors approximate time
Height→time conversion is owner-registered and linear; chains that change
block times skew it. Bounded: the term it will feed is capped, and estimates
are checked against known spans (Ethereum 12s slots).

## What we do not solve

1. **Enforcement.** A walk-away costs score only. No legal rails, no junior
   tranche, no stake to slash. The capacity math bounds the damage; it does
   not make anyone whole.
2. **T3-residual and T8**, above — the two open wash variants in the field.
3. **T9 completeness** until indexing is continuous.
4. **WETH/WBTC truth** without an oracle we refuse to introduce; owner-pushed
   until a trust-minimised foreign-price path exists.

## Reproducing the claims

```bash
forge test                                   # 78 checks green
forge test --match-contract VolumeProofTest  # 45-tx volume + proof.json
forge test --match-contract RealReceiptTest  # real mainnet logs, hash-matched
```
`proof.json` (45 `{txn, protocol, proofbody}` records) and `test/fixtures/`
(real Aave $81.77 repay, real Compound $1000 supply, both hash-verified)
let any reviewer re-derive every number by hand.
