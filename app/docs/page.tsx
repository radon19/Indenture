import { Card, SectionHeading } from "../components/ui";
import { ADDRESSES, SCORE_BRACKETS, PENALTY_BRACKETS, SUPPORTED_TOKENS } from "../lib/site";

function Sig({ children }: { children: string }) {
  return (
    <code className="block overflow-x-auto rounded-lg border border-line bg-paper px-3 py-2 font-mono text-[12.5px] leading-relaxed">
      {children}
    </code>
  );
}

function Fn({
  name,
  desc,
  live = true,
}: {
  name: string;
  desc: string;
  live?: boolean;
}) {
  return (
    <div className="border-b border-line/60 py-3 last:border-0">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <code className="font-mono text-[13px] font-semibold text-ink">{name}</code>
        {!live ? (
          <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[11px] text-muted">
            owner
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{desc}</p>
    </div>
  );
}

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <SectionHeading
        kicker="Docs"
        title="One trustable credit source."
        lede="One verified registry every Creditcoin lender can price from. Read-only — no keys."
      />

      {/* SCORE */}
      <section className="mt-10">
        <h2 className="font-mono text-[12px] uppercase tracking-[0.18em] text-gold-deep">
          OnChainCreditScore · {ADDRESSES.creditcoinTestnet.creditScore}
        </h2>
        <Card className="mt-3 divide-y divide-line/60 px-5">
          <Fn name="getScore(user) → uint16" desc="400–900, 600 before any history. Stored at ingest plus a live +10 tenure bonus past 30 days of seasoning, 900 ceiling." />
          <Fn name="getTier(user) → Bronze | Silver | Gold | Platinum" desc="From blended stake = biggest single USD repayment + 35% of lifetime volume, plus venue count. Any default caps at Gold." />
          <Fn name="getCapacity(user) → uint256" desc="Lifetime repaid volume in 18-decimal USD. Visibility only — tiers read the blend." />
          <Fn name="getMaxRepayment(user) → uint256" desc="Biggest single USD repayment. The wash-killer." />
          <Fn name="getCollateralBps(user) → uint32" desc="9000 / 11000 / 13000 / 15000 by tier. Feed straight into your collateral math." />
          <Fn name="getInterestBps(user) → uint16" desc="500 / 800 / 1200 / 1800 by tier, +200 per default, capped at 2500." />
          <Fn name="getVenues(user) → uint8" desc="Bitmask of proven venues: 1 Aave, 2 Spark, 4 Compound." />
          <Fn name="getDefaults(user) → uint16" desc="Count of recorded defaults. Saturates, never bricks." />
          <Fn name="getOldestActivity(user) → uint64" desc="Earliest proven source-chain timestamp. Downward-only." />
          <Fn name="previewCredit(user) → tuple" desc="Score, capacity, max, oldest, venues, defaults, tier, collateral, interest — one call for dashboards." />
          <Fn name="setPrice / registerReserve / registerChainAnchor" desc="Owner-curated tables: USD prices (stables locked at $1, $1M cap), token decimals, height→time anchors. Every miss reverts retryably." live={false} />
          <Fn name="pause / unpause / transferOwnership" desc="Circuit breaker and Safe handover. Pause never burns proofs." live={false} />
        </Card>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Card className="p-5">
            <h3 className="text-[15px] font-semibold">Repayment points</h3>
            <dl className="tabular mt-2 space-y-1 font-mono text-[13px]">
              {SCORE_BRACKETS.map((b) => (
                <div key={b.range} className="flex justify-between gap-4">
                  <dt className="text-muted">{b.range}</dt>
                  <dd>{b.points}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card className="p-5">
            <h3 className="text-[15px] font-semibold">Default penalties</h3>
            <dl className="tabular mt-2 space-y-1 font-mono text-[13px]">
              {PENALTY_BRACKETS.map((b) => (
                <div key={b.range} className="flex justify-between gap-4">
                  <dt className="text-muted">{b.range}</dt>
                  <dd>{b.penalty}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[13px] text-muted">Floor 400, ceiling 900, +10 tenure past 30 days. Dust never initializes a profile.</p>
          </Card>
        </div>
      </section>

      {/* POOL */}
      <section className="mt-10">
        <h2 className="font-mono text-[12px] uppercase tracking-[0.18em] text-gold-deep">
          MainLoanFacility · {ADDRESSES.creditcoinTestnet.loanPool}
        </h2>
        <Card className="mt-3 divide-y divide-line/60 px-5">
          <Fn name="quoteCollateralWei(user, debt) → uint256" desc="CTC required right now at the borrower's live tier." />
          <Fn name="quoteMaxBorrow(user, collateral) → uint256" desc="Inverse quote for UIs." />
          <Fn name="preview(user) → tuple" desc="Score, terms, position, and pool liquidity in one call." />
          <Fn name="borrow(amount) payable" desc="Locks CTC, draws mUSDC. Rate snapshot freezes at origination." />
          <Fn name="repay(amount)" desc="Interest first, then principal. Overpays cap at owed." />
          <Fn name="addCollateral() payable / withdrawCollateral(amount)" desc="Top up anytime; withdraw only while the tier requirement still holds." />
          <Fn name="interestDue(user) / totalOwed(user) / getPosition(user)" desc="Live debt math for dashboards: banked + pending interest, full close price, raw position." />
          <Fn name="liquidate(borrower)" desc="Permissionless past the health line. Seized covers debt to the pool; excess refunds." />
        </Card>
      </section>

      {/* LEDGER */}
      <section className="mt-10">
        <h2 className="font-mono text-[12px] uppercase tracking-[0.18em] text-gold-deep">
          Supported tokens · {SUPPORTED_TOKENS.length} live
        </h2>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">
          Every token below was read back on-chain after onboarding. Anything
          else reverts loudly instead of scoring wrong — that is the policy.
        </p>
        <Card className="mt-3 overflow-hidden">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-line bg-parchment font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
                <th className="px-4 py-2.5 font-medium">Token</th>
                <th className="px-4 py-2.5 font-medium">Address</th>
                <th className="px-4 py-2.5 font-medium">Decimals</th>
                <th className="px-4 py-2.5 font-medium">Price</th>
              </tr>
            </thead>
            <tbody className="tabular font-mono">
              {SUPPORTED_TOKENS.map((t) => (
                <tr key={t.symbol} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-2.5 font-semibold">{t.symbol}</td>
                  <td className="px-4 py-2.5 text-muted" title={t.address}>
                    {t.address.slice(0, 10)}…{t.address.slice(-6)}
                  </td>
                  <td className="px-4 py-2.5">{t.decimals}</td>
                  <td className="px-4 py-2.5 text-muted">{t.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      {/* LEDGER */}
      <section className="mt-10">
        <h2 className="font-mono text-[12px] uppercase tracking-[0.18em] text-gold-deep">
          LoanFacility (Sepolia) · {ADDRESSES.sepolia.loanFacility}
        </h2>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">
          Pure history ledger — no funds move. Borrowers open their own loans,
          anyone may repay or mark genuinely overdue loans. Event layouts are pinned;
          moving a field breaks cross-chain verification.
        </p>
        <div className="mt-3 grid gap-3">
          <Sig>LoanRepaid(uint256 indexed loanId, address indexed borrower, uint256 amount, uint256 remaining)</Sig>
          <Sig>LoanDefaulted(uint256 indexed loanId, address indexed borrower, uint256 remaining)</Sig>
          <Sig>Repay(address indexed reserve, address indexed user, address indexed repayer, uint256 amount, bool useATokens) — Aave V3</Sig>
          <Sig>Supply(address indexed from, address indexed dst, uint256 amount) — Compound v3, base asset implied by emitter</Sig>
          <Sig>AbsorbCollateral(address indexed absorber, address indexed borrower, address indexed asset, uint256 absorbed, uint256 usdValue) — Compound v3</Sig>
        </div>
      </section>

      {/* EVIDENCE FORMAT */}
      <section id="evidence-format" className="mt-10 scroll-mt-24">
        <h2 className="font-mono text-[12px] uppercase tracking-[0.18em] text-gold-deep">
          Evidence record format
        </h2>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">
          <code className="font-mono text-[13px] text-ink">contracts/proof.json</code> is
          an array of 45 records — the same payloads the test suite ingests:
        </p>
        <div className="mt-3">
          <Sig>{`{ "txn": "7", "protocol": "aave" | "spark" | "compound", "proofbody": "0x…" }`}</Sig>
        </div>
      </section>
    </div>
  );
}
