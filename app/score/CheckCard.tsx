"use client";

import { Card, Field, TextInput, Btn, EmptyState, TierBadge, type TierName } from "../components/ui";
import type { CreditView } from "../lib/stubs";
import { formatUnits } from "viem";

export function usd(raw: string | null): string {
  if (raw == null) return "—";
  try {
    const [whole, frac = ""] = formatUnits(BigInt(raw), 18).split(".");
    const grouped = Number(whole).toLocaleString("en-US");
    return frac.slice(0, 2) === "00" || frac === ""
      ? `$${grouped}`
      : `$${grouped}.${frac.slice(0, 2)}`;
  } catch {
    return "—";
  }
}

const TIER_BG: Record<TierName, string> = {
  Bronze: "bg-[#26211b]",
  Silver: "bg-[#22262c]",
  Gold: "bg-[#2a2417]",
  Platinum: "bg-[#1c2723]",
};

export default function CheckCard({
  query,
  setQuery,
  queryError,
  submitted,
  credit,
  isLoading,
  onLookup,
}: {
  query: string;
  setQuery: (v: string) => void;
  queryError: string | null;
  submitted: string;
  credit: CreditView;
  isLoading: boolean;
  onLookup: () => void;
}) {
  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold tracking-tight">Check score</h3>
      <div className="mt-4">
        <Field label="Borrower address">
          <div className="flex gap-2">
            <TextInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="0x…"
              spellCheck={false}
            />
            <Btn variant="ink" onClick={onLookup}>
              Look up
            </Btn>
          </div>
        </Field>
        {queryError ? (
          <p className="mt-2 text-[13px] font-medium text-bronze">{queryError}</p>
        ) : null}
      </div>
      {isLoading ? (
        <div className="mt-4">
          <p className="font-mono text-[13px] text-faint">Loading score…</p>
        </div>
      ) : credit.score == null ? (
        <div className="mt-4">
          <EmptyState
            title="No score loaded"
            body="Enter an address to read score, tier, capacity, venues, defaults, and oldest activity from the registry."
          />
        </div>
      ) : (
        <div className={`mt-5 overflow-hidden rounded-2xl text-paper shadow-lg ${credit.tier ? TIER_BG[credit.tier] : "bg-ink"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-paper/10 px-6 py-4">
            <p className="tabular break-all font-mono text-[13px] text-paper/80">{submitted}</p>
            {credit.tier ? <TierBadge tier={credit.tier} /> : null}
          </div>
          <div className="grid items-center gap-8 p-6 sm:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] sm:p-8">
            <div className="mx-auto w-full max-w-60 rounded-xl border border-paper/15 bg-ink/60 p-6 text-center">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-paper/45">Score</p>
              <p className="tabular mt-1 font-mono text-2xl font-semibold text-paper">{credit.score}</p>
              <p className="mt-1 font-mono text-[12px] text-paper/45">/ 900</p>
            </div>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-paper/10 font-mono">
              {[
                ["Capacity", credit.capacity == null ? "—" : usd(credit.capacity)],
                ["Max repay", credit.maxRepayment == null ? "—" : usd(credit.maxRepayment)],
                ["Venues", credit.venues == null ? "—" : String(credit.venues)],
                ["Defaults", credit.defaults == null ? "—" : String(credit.defaults)],
              ].map(([label, value]) => (
                <div key={label} className="px-5 py-4">
                  <dt className="text-[11px] uppercase tracking-[0.16em] text-paper/45">{label}</dt>
                  <dd className="tabular mt-1 text-xl font-semibold text-paper">{value}</dd>
                </div>
              ))}
              <div className="col-span-2 px-5 py-4">
                <dt className="text-[11px] uppercase tracking-[0.16em] text-paper/45">Oldest activity</dt>
                <dd className="tabular mt-1 text-xl font-semibold text-paper">
                  {credit.oldestActivity == null || credit.oldestActivity === "0"
                    ? "—"
                    : new Date(Number(credit.oldestActivity) * 1000).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </Card>
  );
}
