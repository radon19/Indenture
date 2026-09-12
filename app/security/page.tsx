import { Card, SectionHeading } from "../components/ui";

function Item({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-b border-line/60 py-4 last:border-0">
      <h3 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h3>
      <p className="mt-1 max-w-3xl text-[14px] leading-relaxed text-muted">{body}</p>
    </div>
  );
}

export default function SecurityPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <SectionHeading
        kicker="Security"
        title="What stops what, stated plainly."
        lede="Undercollateralized lending dies on disclosure failure, not model failure. Solved and live first, deferred with reasons second, genuinely unsolved last."
      />

      <Card className="mt-8 border-ink bg-ink p-6 text-paper">
        <p className="font-mono text-[12px] uppercase tracking-[0.18em] text-gold">P0 — the load-bearing principle</p>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-paper/85">
          Anyone can prove anything about anyone. The borrower is read from an
          indexed topic, never from the submitter — so a hidden liquidation can be
          filed by a lender, a competitor, or a bot. Volume adds coverage without
          adding forgery: proofs verify or they revert.
        </p>
      </Card>

      <section className="mt-10">
        <h2 className="font-mono text-[12px] uppercase tracking-[0.18em] text-gold-deep">
          Solved and live
        </h2>
        <Card className="mt-3 px-5">
          <Item title="S1 — Forged history is impossible" body="Fabricated repayments need forged Merkle and continuity proofs against the attestor set. The precompile is the test." />
          <Item title="S2 — Photocopied capacity" body="Tiers read max plus 35% of volume, never the sum. $100 repaid ten times stalls at 450 stake; a real $1,000 single repayment clears 1,350." />
          <Item title="S3 — Flash-loan capacity" body="Denied only on an identical emitter, coin, and user triple. Honest refinancing scores; multi-repay transactions accumulate." />
          <Item title="S4 — Ledger griefing" body="Self-open loans, post-due-only defaults, dollar-scaled penalties, settleable debt. A wei of malice costs −20, not a tier." />
          <Item title="S5 — Fail-loud ingestion" body="Unknown token, missing price, malformed topics, paused registry: all revert before burning the proof. Proven live — the first GHO and weETH liquidations bounced, were registered in two casts each, and ingested on retry." />
          <Item title="S6 — Dust, replays, overflow bricks" body="Sub-dust exits before a profile is born. One transaction ingests once. Counters saturate instead of bricking." />
          <Item title="S7 — Real pool economics" body="Interest accrues and is charged, health counts debt plus interest, seized collateral stays in the pool with excess refunded. Refund math pinned to the wei." />
          <Item title="S8 — Provenance you can re-derive" body="Real mainnet receipts, a 45-transaction volume run, live evidence rows — any reviewer with cast can redo every number." />
          <Item title="S9 — Tenure pays the patient" body="Seasoned proven history earns +10 past 30 days, hard-capped with the 900 ceiling. Old honest wallets outrank fresh farmed ones." />
          <Item title="S10 — Multisig is live" body="Official Safe bytecode deployed by us, all three contracts owned by the 2-of-3 vault, verified on-chain. Propose, collect, execute tooling ships in the repo." />
          <Item title="S11 — Paper that points back to chain" body="Printable receipts restate score, tier, and filed proofs with live verify links per row — but the statement is unsigned by design. The paper never outranks the chain: every claim re-derives from registry reads and explorer transactions. Filing itself is atomic (one create wins, retries update), so concurrent proofs of the same transaction can't double-count." />
        </Card>
      </section>

      <section className="mt-10">
        <h2 className="font-mono text-[12px] uppercase tracking-[0.18em] text-gold-deep">
          Deferred on purpose
        </h2>
        <Card className="mt-3 px-5">
          <Item title="D1 — Timelock, not the vault" body="The vault is live. What remains is the delay in front of it: approved changes waiting 24–48h in public before executing." />
          <Item title="D2 — Continuous poller specified, not running" body="Proving on demand covers judging; the poller ships with mainnet sources, where hidden liquidations actually need hunting." />
        </Card>
      </section>

      <section className="mt-10">
        <h2 className="font-mono text-[12px] uppercase tracking-[0.18em] text-gold-deep">
          Genuinely unsolved — by everyone
        </h2>
        <Card className="mt-3 px-5">
          <Item title="Enforcement" body="A walk-away costs score only. No legal rails, no junior tranche, no slashable stake — field-wide." />
          <Item title="Slow wash" body="Borrow, hold, repay across blocks earns full credit for pocket change. Duration-weighting is specified, unbuilt, everywhere." />
          <Item title="Hidden-history completeness" body="Omission is contestable today, complete only with continuous indexing." />
          <Item title="Foreign-asset truth without an oracle" body="Owner-pushed prices with locks and bounds until a trust-minimised path exists. Refused to fake." />
          <Item title="External flash capital" body="Same-transaction guards cannot see money from outside registered pools. No scorer closes this." />
        </Card>
      </section>

      <section className="mt-10">
        <h2 className="font-mono text-[12px] uppercase tracking-[0.18em] text-gold-deep">
          Reproduce it
        </h2>
        <Card className="mt-3 bg-ink p-5 text-paper">
          <code className="block font-mono text-[13px] leading-loose">
            forge test <span className="text-paper/50"># 112 checks green</span>
            <br />
            forge test --match-contract VolumeProofTest
            <br />
            forge test --match-contract RealReceiptTest
          </code>
        </Card>
      </section>
    </div>
  );
}
