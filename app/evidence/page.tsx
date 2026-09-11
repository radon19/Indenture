"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, SectionHeading, EmptyState } from "../components/ui";
import { PROTOCOLS, PROTOCOL_LABEL, type Protocol } from "../lib/site";
import { EXPLORERS } from "../lib/stubs";
import { useEvidence } from "../lib/stubs";

type Kind = "all" | "repay" | "liquidation";

const KINDS: { id: Kind; label: string }[] = [
  { id: "all", label: "All" },
  { id: "repay", label: "Repayments" },
  { id: "liquidation", label: "Liquidations" },
];

export default function EvidencePage() {
  const [protocol, setProtocol] = useState<"all" | Protocol>("all");
  const [kind, setKind] = useState<Kind>("all");
  const { rows, loading, totalProved, breakdown } = useEvidence(protocol, kind);

  const forProtocol = (p: Protocol) => {
    const parts = breakdown.filter((b) => b.protocol === p);
    const repays = parts.find((b) => b.kind === "repay")?.count ?? 0;
    const liqs = parts.find((b) => b.kind === "liquidation")?.count ?? 0;
    return { total: repays + liqs, repays, liqs };
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <SectionHeading
        kicker="Evidence"
        title="Every point has a receipt."
        lede="Every proven call, stored as it verifies."
      />

      <div className="mt-6 flex flex-wrap items-end gap-8">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">Total payments proved</p>
          <p className="tabular mt-0.5 font-mono text-3xl font-semibold">
            {loading ? "—" : totalProved}
          </p>
        </div>
        <p className="max-w-md pb-1 text-[13px] text-muted">
          Every proven call ever — repayments and liquidations alike. Same transaction twice still counts once.
        </p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Sub-cent proofs", "Each ingest costs a few hundred thousand gas — fractions of a cent at testnet prices. Honesty is cheap here."],
          ["Verify or revert", "Every proof passes the block prover or dies on-chain. There is no maybe state."],
          ["Anyone reports", "Liquidations land even when borrowers stay silent — filed by lenders, competitors, or bots."],
          ["Multisig registry", "Prices, sources, and pauses answer to a 2-of-3 Safe, not a laptop."],
        ].map(([title, body]) => (
          <Card key={title} className="p-5">
            <p className="text-[15px] font-semibold tracking-tight">{title}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{body}</p>
          </Card>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <FilterPill active={protocol === "all"} onClick={() => setProtocol("all")}>
          All protocols
        </FilterPill>
        {PROTOCOLS.map((p) => (
          <FilterPill key={p} active={protocol === p} onClick={() => setProtocol(p)}>
            {PROTOCOL_LABEL[p]}
          </FilterPill>
        ))}
        <span className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden />
        {KINDS.map((k) => (
          <FilterPill key={k.id} active={kind === k.id} onClick={() => setKind(k.id)}>
            {k.label}
          </FilterPill>
        ))}
      </div>

      <Card className="mt-4 overflow-hidden">
        <table className="w-full text-left text-[13px]">
          <thead>
              <tr className="border-b border-line bg-parchment font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
              <th className="px-4 py-2.5 font-medium">Transaction</th>
              <th className="px-4 py-2.5 font-medium">Protocol</th>
              <th className="px-4 py-2.5 font-medium">Kind</th>
              <th className="px-4 py-2.5 font-medium">Amount</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.txHash} className="tabular border-b border-line/60 font-mono last:border-0">
                <td className="px-4 py-2.5" title={r.txHash}>
                  <a
                    href={`${EXPLORERS[r.chainKey] ?? EXPLORERS[3]}/tx/${r.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-gold-deep underline underline-offset-2 hover:text-ink"
                  >
                    {r.txHash.slice(0, 10)}…{r.txHash.slice(-6)} ↗
                  </a>
                </td>
                <td className="px-4 py-2.5">{r.protocol}</td>
                <td className="px-4 py-2.5">{r.kind}</td>
                <td className="px-4 py-2.5">{r.amount}</td>
                <td className="px-4 py-2.5">{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && !loading ? (
          <div className="p-4">
            <EmptyState
              title="No evidence yet"
              body="Nothing proven through this filter. Prove history from the score page and it lands here automatically."
              action={
                <Link
                  href="/score"
                  className="rounded-lg border border-line bg-paper px-4 py-2 text-[13px] font-semibold text-ink hover:bg-parchment"
                >
                  Prove history
                </Link>
              }
            />
          </div>
        ) : null}
      </Card>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {(Object.keys(PROTOCOL_LABEL) as Protocol[]).map((p) => {
          const c = forProtocol(p);
          return (
            <Card key={p} className="p-5">
              <p className="text-[14px] font-semibold">{PROTOCOL_LABEL[p]}</p>
              <p className="tabular mt-1 font-mono text-3xl font-semibold">
                {loading ? "—" : c.total}
              </p>
              <p className="mt-1 text-[13px] text-muted">
                {loading ? "loading…" : `${c.repays} repayments, ${c.liqs} liquidations`}
              </p>
            </Card>
          );
        })}
      </div>

      <p className="mt-6 text-[13px] text-muted">
        Counts above are live from the evidence store. The 45-transaction
        reference run is reproducible:{" "}
        <code className="rounded bg-parchment px-1.5 py-0.5 font-mono text-[12px]">
          forge test --match-contract VolumeProofTest
        </code>
      </p>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-[13px] font-medium transition-colors ${
        active ? "border-ink bg-ink text-paper" : "border-line bg-card text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
