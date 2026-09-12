<div align="center">

<img src="public/indentureLogo.svg" alt="Indenture Logo" width="80" />

# Indenture

### Portable On-Chain Credit — Prove Repayment Once, Borrow Everywhere

**Cross-chain attested scores. Undercollateralized loans. Printable proofs.**

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white&style=flat-square)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white&style=flat-square)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black&style=flat-square)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white&style=flat-square)](https://tailwindcss.com/)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.28-363636?logo=solidity&logoColor=white&style=flat-square)](https://soliditylang.org/)
[![Foundry](https://img.shields.io/badge/Foundry-112_tests-green?style=flat-square)](https://book.getfoundry.sh/)
[![Bun](https://img.shields.io/badge/Bun-1.4-fbf0df?logo=bun&logoColor=black&style=flat-square)](https://bun.sh/)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white&style=flat-square)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?logo=postgresql&logoColor=white&style=flat-square)](https://www.postgresql.org/)
[![Creditcoin](https://img.shields.io/badge/Creditcoin-102031-orange?style=flat-square)](https://creditcoin.org/)

---

Indenture is a **cross-chain credit protocol** that turns real Ethereum repayment
history into a portable on-chain score — and prices undercollateralized loans
off it. Users prove Aave, Spark, or Compound repayments with Merkle + continuity
attestations verified by precompile, build a 400–900 score, borrow at tiered
terms, and print a verifiable Proof of Record.

**Live: [indenture.vercel.app](https://indenture.vercel.app)**

Built for judges who verify and recruiters who read code.

</div>

---

## Core Value Proposition

| Problem | Indenture Solution |
|---|---|
| Good borrowers look identical to fresh wallets on every new chain | Portable 400–900 score proven from real mainnet repayment history |
| Repayment claims are self-reported and trust-based | Merkle + continuity proofs verified on-chain by precompile — proofs verify or revert |
| Wash trading farms reputation for free | Tier math reads max single repayment + 35% of volume — $100×10 stalls at 450 stake, below Platinum |
| Flash loans mint capacity with zero capital at risk | Same-emitter/coin/user borrow+repay triples prove no capacity |
| Credit history isn't shareable off-chain | Printable Proof of Record per wallet — score, tier, every filed proof with live explorer links |
| Proving the same history twice double-counts | Atomic filing (create-first, conflict falls back to update) + on-chain replay guard |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│   Next.js 16 · React 19 · Tailwind CSS 4 · TypeScript 5       │
│   RainbowKit + wagmi — simulation-before-submit wallet flow    │
├─────────────────────────────────────────────────────────────────┤
│                         API LAYER                               │
│   /api/prove · /api/evidence · /api/receipt · Zod-shape checks │
├─────────────────────────────────────────────────────────────────┤
│                       SERVICES LAYER                            │
│   Proving worker (Bun) — receipt check · log summary · proof   │
│   build via ProofBuilder · already-processed treated as success │
├─────────────────────────────────────────────────────────────────┤
│                        DATA LAYER                               │
│   PostgreSQL · Prisma 7 · pgBouncer pooler · dedupe by txHash  │
├─────────────────────────────────────────────────────────────────┤
│                     BLOCKCHAIN LAYER                            │
│   Creditcoin 102031 — Score registry · Lending pool · 2-of-3   │
│   Safe · Ethereum mainnet + Sepolia as attested sources        │
└─────────────────────────────────────────────────────────────────┘
```

## Feature Set

### Prove & Verify

- **Any supported repayment, one flow** — paste a tx hash, worker pre-checks the
  receipt, builds the attestation, wallet submits `execute()`. Simulation runs
  first; "already processed" is a success state, not an error.
- **Borrower from topics, never the submitter** — anyone can file for anyone, so
  hidden liquidations get reported by lenders, competitors, or bots.
- **Fail-loud ingestion** — unknown token, missing price, unregistered market,
  malformed topics, paused registry: all revert *before* consuming the proof,
  so every failure is retryable after registration.

### Score & Tiers

- **400–900 score, 600 default** — per-repayment point brackets, floor/ceiling
  enforced on-chain, +10 tenure bonus past 30 days of seasoned history.
- **Blended-stake tiers** — Bronze 150%/18% → Silver 130%/12% → Gold 110%/8% →
  **Platinum 90%/5%**. Any default caps you at Gold. Terms read straight off
  the deployed contracts.
- **Capacity tracking** — lifetime repaid volume, biggest single repayment,
  venue bitmask, default count, oldest activity — one `previewCredit` call.

### Borrow

- **Tier-priced loans** — lock CTC, draw mUSDC. Rate snapshot freezes at
  origination; interest-first repayments; withdraw when debt is zero.
- **Permissionless liquidation** — past the health line anyone may liquidate;
  seized collateral stays in the pool, excess refunded to the wei.
- **Live quotes** — collateral required and max-borrow read from chain state,
  not cached.

### Receipts & Evidence

- **Proof of Record (`/receipt/[address]`)** — printable sheet per wallet:
  score, tier, capacity, venues, defaults, oldest activity, and every filed
  proof with explorer links. Print stylesheet included; links expand to full
  URLs on paper.
- **Signed statement + honest disclaimer** — issued under an Indenture
  statement with the date, next to the plain-English truth: Indenture files
  nothing itself, proving is permissionless, paper never outranks chain.
- **Receipt API (`GET /api/receipt?user=0x…`)** — score + proofs in one call;
  chain and DB halves fail independently so outages degrade, never blank.
- **Evidence explorer** — every proven call ever, filterable by protocol and
  kind, with per-row explorer links and live breakdowns.

## Supported Markets

| Venue | Source | What counts |
|---|---|---|
| Aave V3 | Ethereum mainnet (`0x8787…4E2`) | `Repay` / `LiquidationCall` |
| Spark | Ethereum mainnet (`0xC13e…987`) | `Repay` / `LiquidationCall` |
| Compound v3 | Comet USDC (`0xc3d6…dc3`), Comet USDT (`0x3Afd…840`) | `Supply` / `AbsorbCollateral` |
| LoanFacility | Sepolia (`0xbdf4…8387`) | `LoanRepaid` / `LoanDefaulted` |

Source keys: `3` = Ethereum mainnet, `1` = Sepolia. Full reserve table
(USDC, USDT, DAI, WETH, WBTC, cbBTC, cbETH, rETH, USDe, LINK) lives on the
[/docs](https://indenture.vercel.app/docs) page — every entry read back
on-chain after onboarding; anything else reverts loudly instead of scoring
wrong.

## Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Runtime** | Bun 1.4 | Worker, scripts, tests, builds — one fast runtime end to end |
| **Frontend** | Next.js 16 App Router (Turbopack) | Pages + serverless API routes in one Vercel deploy |
| **UI** | React 19 + Tailwind CSS 4 | Utility-first, print stylesheets, skeletons, mobile-first |
| **Language** | TypeScript 5 | End-to-end typing, `bun run build` typechecks |
| **Wallet** | wagmi 2, RainbowKit, viem 2, ethers 6 | Typed calls, pre-flight simulation, proof builder transport |
| **Contracts** | Solidity 0.8.28, Foundry | 112-test suite incl. real mainnet receipt replays |
| **Prover SDK** | @gluwa/usc-sdk ProofBuilder | Attestation without holding keys |
| **Database** | PostgreSQL 15 + Prisma 7 + pgBouncer | Transaction pooler for serverless, direct URL for migrations |
| **Chains** | Creditcoin 102031 · Ethereum · Sepolia | Verify where it's cheap, score where it's used |

## Measured, Not Estimated

Produced from this repo on 2026-09-12 (dev machine, Supabase ap-southeast-1;
cold = first hit, warm = pooled):

| Check | Result |
|---|---|
| `forge test` (contracts/) | **112 passed, 0 failed, 1.37s** |
| `bun test worker/` | **12 passed, 0 failed, 274ms** |
| `bun run build` | compiles ~1s, full prod build + typecheck green |
| `GET /api/evidence` | ~1.38s cold → **~0.35s warm** |
| `GET /api/receipt?user=` | ~1.29s (chain + DB in one call) |
| Invalid input rejection | **68ms** (validation before any I/O) |

Reproduce everything: `forge test` · `bun test worker/` · `bun run build` ·
`GET /api/evidence?protocol=all&kind=all`.

## Project Structure

```
Indenture/
├── app/
│   ├── score/          # Check score + prove history
│   ├── borrow/         # Tier-priced loans + positions
│   ├── evidence/       # Proven-call explorer
│   ├── receipt/[address]/  # Printable Proof of Record
│   ├── api/prove/      # → worker (secret stays server-side)
│   ├── api/evidence/   # reads + atomic writes, offline-first
│   ├── api/receipt/    # wallet score + proofs, halves fail independently
│   ├── docs/ security/ # credit-source docs + threat model
│   └── lib/            # site truth, ABIs, retrieval hooks, evidence writer
├── worker/
│   ├── api.ts          # proving API (:3001, secret-gated, throttled)
│   ├── worker.ts       # CLI — prove, dry-run, submit
│   ├── prove.ts        # receipt fetch, log summarizer, proof builder
│   └── safe.ts         # 2-of-3 Safe propose/sign/execute tooling
├── contracts/
│   ├── src/            # registry, pool, mock ledger, score math lib
│   ├── test/           # 112 checks incl. real-receipt + wash suites
│   ├── script/         # Sepolia / Creditcoin deploys
│   └── SECURITY.md     # solved · deferred · unsolved, with reasons
├── prisma/             # Evidence + Counter schema, one migration
└── providers/          # wagmi/RainbowKit (Creditcoin + Sepolia)
```

## Getting Started

### Prerequisites

- **Bun** 1.4+ · **Foundry** (forge) · **PostgreSQL** 15+ (or Supabase)
- Source-chain RPC URL · Creditcoin RPC URL + funded key (for submitting)

### Installation

```bash
git clone <repository-url>
cd Indenture
bun install
cd worker && bun install && cd ..
```

### Environment Configuration

```bash
cp .env.example .env            # DATABASE_URL (PostgreSQL ≥ 15)
cp worker/.env.example worker/.env
```

| Variable | Where | Description |
|---|---|---|
| `DATABASE_URL` | root | PostgreSQL connection (pooler URL at deploy) |
| `WORKER_URL` / `WORKER_AUTH_TOKEN` | root | Proving worker endpoint + shared secret (never to browsers) |
| `NEXT_PUBLIC_CREDITCOIN_RPC_URL` | root | Creditcoin RPC (baked at build time — rebuild after changing) |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | root | WalletConnect project ID |
| `SOURCE_RPC_URL_3` / `_1` | worker | Ethereum / Sepolia RPCs for receipt pre-check |
| `CREDITCOIN_PROOF_BUILDER_URL` | worker | Attestation builder endpoint |
| `CREDITCOIN_RPC_URL` / `CREDITCOIN_PRIVATE_KEY` | worker | Submitting key (omit for `--dry` runs) |
| `SCORE_CONTRACT` | worker | Deployed `OnChainCreditScore` |

### Database Setup

```bash
bunx prisma migrate deploy
```

### Development

```bash
bun run dev              # app on :3000
cd worker && bun api.ts  # prover on :3001
```

### Verification

```bash
forge test               # 112 contract checks
bun test worker/         # 12 prover checks
bun run build            # prod build + typecheck
```

## Security Model

```
┌──────────────────────────────────────────────────────────────┐
│  1. PROOFS     │  Merkle + continuity verified by precompile │
│  2. ROUTING    │  Borrower from indexed topics, never sender │
│  3. SCORING    │  Wash-capped stake, flash triples ignored   │
│  4. FAIL-LOUD  │  Unknowns revert before consuming proofs    │
│  5. CUSTODY    │  2-of-3 Safe owns registry, pool, prices    │
│  6. PAPER      │  Receipts unsigned by design — chain proves │
└──────────────────────────────────────────────────────────────┘
```

**Key properties:** forged history impossible by construction · one transaction
ingests once · dust never initializes a profile · counters saturate instead of
bricking · owner-pushed prices with locks and bounds until a trust-minimised
oracle path exists (stated, not faked). Full model: [/security](https://indenture.vercel.app/security) and [`contracts/SECURITY.md`](contracts/SECURITY.md).

## Roadmap

- [ ] **Batched ingest** — multi-proof `execute`, the known ~4× gas lever
- [ ] **Backfill worker** — reconcile on-chain ingests missing from the store
- [ ] **Continuous poller** — auto-import liquidations alongside mainnet sources
- [ ] **Timelock** — 24–48h public delay in front of the Safe
- [ ] **Duration-weighted capacity** — debt × time, the field's hardest problem
- [ ] **Professional audit** — before any real value touches the pool

## Contributing

This repo runs on two rules: **evidence before synthesis, verification before
completion.**

- **Verify** — `forge test`, `bun test worker/`, `bun run build` before claiming done
- **Atomic fixes** — one root cause per change, no bundled drive-bys
- **Fail loud** — unknown states revert/503 with the real error logged, never silent wrong data
- **Match the world** — site copy follows deployed contracts, not the reverse

---

<div align="center">

**Paper states, chain proves.**

</div>
