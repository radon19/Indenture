"use client";

import { use } from "react";
import Link from "next/link";
import { Card, EmptyState, Skeleton } from "../../components/ui";
import { IndentureLogo } from "../../header/IndentureLogo";
import { usd } from "../../score/CheckCard";
import { EXPLORERS, useCreditScore, useEvidence } from "../../lib/stubs";

const APP_URL = "https://indenture.vercel.app";

const TIER_DOT = {
  Bronze: "bg-bronze",
  Silver: "bg-silver",
  Gold: "bg-gold",
  Platinum: "bg-platinum",
} as const;

export default function ReceiptPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = use(params);
  const valid = /^0x[0-9a-fA-F]{40}$/.test(address.trim());
  const { data: credit, isLoading: scoreLoading } = useCreditScore(
    valid ? address.trim() : undefined,
  );
  const { rows, loading: evidenceLoading } = useEvidence("all", "all");
  const proofs = valid
    ? rows.filter(
        (r) =>
          typeof r.borrower === "string" &&
          r.borrower.toLowerCase() === address.trim().toLowerCase(),
      )
    : [];
  const loading = scoreLoading || evidenceLoading;
  const today = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  if (!valid) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <EmptyState
          title="Bad address"
          body="Receipts need a wallet address: /receipt/0x… (40 hex characters)."
          action={
            <Link
              href="/score"
              className="rounded-lg border border-line bg-paper px-4 py-2 text-[13px] font-semibold text-ink hover:bg-parchment"
            >
              Back to score
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-ink px-4 py-2 text-[14px] font-semibold text-paper hover:bg-ink-soft"
        >
          Print receipt
        </button>
        <Link
          href="/score"
          className="rounded-lg border border-line bg-card px-4 py-2 text-[14px] font-semibold text-ink hover:bg-parchment"
        >
          Back to score
        </Link>
      </div>

      <Card className="overflow-hidden p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <IndentureLogo size={36} className="rounded-lg ring-1 ring-line" />
          <div>
            <p className="text-[18px] font-semibold tracking-tight">Indenture — Proof of Record</p>
            <p className="font-mono text-[12px] text-muted">issued {today} · verify live, never trust paper</p>
          </div>
        </div>

        <p className="mt-5 break-all font-mono text-[13px] text-muted">{address.trim()}</p>

        {loading ? (
          <div className="mt-6">
            <Skeleton className="h-9 w-40" />
            <div className="mt-4 grid grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </div>
        ) : credit.score == null ? (
          <div className="mt-6">
            <EmptyState
              title="No record on file"
              body="This wallet has no proven history yet. Prove a repayment from the score page and it lands here."
            />
          </div>
        ) : (
          <>
            <div className="mt-6 flex flex-col gap-5 rounded-2xl bg-ink p-6 text-paper sm:flex-row sm:items-center sm:justify-between sm:p-8 print:border print:border-line print:bg-white print:text-ink">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-paper/50 print:text-muted">
                  Credit score
                </p>
                <p className="tabular mt-1 font-mono font-semibold leading-none">
                  <span className="text-7xl">{credit.score}</span>
                  <span className="ml-2 text-xl text-paper/50 print:text-muted">/ 900</span>
                </p>
              </div>
              {credit.tier ? (
                <div className="flex items-center gap-3 border-t border-paper/15 pt-5 sm:border-0 sm:pt-0 print:border-line">
                  <span className={`h-4 w-4 rounded-full ${TIER_DOT[credit.tier]}`} aria-hidden />
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-paper/50 print:text-muted">
                      Tier
                    </p>
                    <p className="text-3xl font-semibold tracking-tight">{credit.tier}</p>
                  </div>
                </div>
              ) : null}
            </div>
            <dl className="tabular mt-5 grid grid-cols-2 gap-x-6 gap-y-3 font-mono text-[14px] sm:grid-cols-3">
              {[
                ["Capacity", credit.capacity == null ? "—" : usd(credit.capacity)],
                ["Max repay", credit.maxRepayment == null ? "—" : usd(credit.maxRepayment)],
                ["Venues", credit.venues == null ? "—" : String(credit.venues)],
                ["Defaults", credit.defaults == null ? "—" : String(credit.defaults)],
                [
                  "Oldest activity",
                  credit.oldestActivity == null || credit.oldestActivity === "0"
                    ? "—"
                    : new Date(Number(credit.oldestActivity) * 1000).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      }),
                ],
                ["Proofs filed", String(proofs.length)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[11px] uppercase tracking-[0.16em] text-faint">{label}</dt>
                  <dd className="mt-0.5 font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          </>
        )}

        <h2 className="mt-8 text-[15px] font-semibold tracking-tight">
          Proven history ({proofs.length})
        </h2>
        {evidenceLoading ? (
          <div className="mt-3 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : proofs.length === 0 && !loading ? (
          <p className="mt-2 text-[13px] text-muted">
            No filed proofs for this wallet yet{credit.score != null ? " — older ingests may predate evidence filing" : ""}.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left font-mono text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-muted">
                  <th className="py-2 pr-3 font-medium">Transaction</th>
                  <th className="py-2 pr-3 font-medium">Protocol</th>
                  <th className="py-2 pr-3 font-medium">Kind</th>
                  <th className="py-2 font-medium">Amount (raw)</th>
                </tr>
              </thead>
              <tbody>
                {proofs.map((r) => (
                  <tr key={r.txHash} className="border-b border-line/60 last:border-0">
                    <td className="py-2 pr-3" title={r.txHash}>
                      <a
                        href={`${EXPLORERS[r.chainKey] ?? EXPLORERS[3]}/tx/${r.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-gold-deep underline underline-offset-2 hover:text-ink"
                      >
                        {r.txHash.slice(0, 10)}…{r.txHash.slice(-6)}
                      </a>
                    </td>
                    <td className="py-2 pr-3">{r.protocol}</td>
                    <td className="py-2 pr-3">{r.kind}</td>
                    <td className="break-all py-2">{r.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-8 rounded-xl border border-gold/60 bg-gold/10 p-5 print:border-line print:bg-white">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-gold-deep">
            Signed by Indenture · {today}
          </p>
          <p className="mt-2 text-[14px] leading-relaxed">
            {proofs.length === 0
              ? "No transactions have been recorded against this wallet yet."
              : `These ${proofs.length} transaction${proofs.length === 1 ? " was" : "s were"} verified on-chain and recorded against this wallet.`}
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            Indenture files nothing itself — proving is permissionless, so anyone can file
            history for anyone. A hidden liquidation can be reported by a lender, a
            competitor, or a bot: more eyes make the record truer, never noisier. Paper
            states, chain proves.
          </p>
        </div>

        <p className="mt-4 text-[12.5px] leading-relaxed text-muted">
          Verify live:{" "}
          <a
            href={`${APP_URL}/receipt/${address.trim()}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-gold-deep underline underline-offset-2 hover:text-ink"
          >
            {APP_URL}/receipt/{address.trim()}
          </a>{" "}
          
        </p>
      </Card>
    </div>
  );
}
