"use client";

import { Card, Field, TextInput, Btn, TierBadge, type TierName } from "../components/ui";
import type { Quote } from "../lib/stubs";

// New-loan form. Takes tier/debt/lock + live quote, renders terms and gates
// the borrow button on quote readiness + sufficient collateral.
export default function BorrowForm({
  tier,
  debt,
  setDebt,
  locked,
  setLocked,
  quote,
  borrowError,
  borrowDone,
  borrowBusy,
  onBorrow,
  borrowHash,
  explorerTx,
}: {
  tier: TierName | null;
  debt: string;
  setDebt: (v: string) => void;
  locked: string;
  setLocked: (v: string) => void;
  quote: Quote;
  borrowError: string | null;
  borrowDone: boolean;
  borrowBusy: boolean;
  onBorrow: () => void;
  borrowHash: `0x${string}` | undefined;
  explorerTx: (h: `0x${string}`) => string;
}) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold tracking-tight">New loan</h3>
        {tier ? <TierBadge tier={tier} size="sm" /> : null}
      </div>
      <div className="mt-4 grid gap-4">
        <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2">
          <Field label="Borrow (mUSDC)" hint="6 decimals">
            <TextInput value={debt} onChange={(e) => setDebt(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Lock (CTC)" hint="18 decimals">
            <TextInput value={locked} onChange={(e) => setLocked(e.target.value)} inputMode="decimal" />
          </Field>
        </div>
        <Card className="border-dashed bg-paper p-4">
          <div className="grid grid-cols-2 gap-3 font-mono text-[13px]">
            <span className="text-muted">Collateral ratio</span>
            <span className="tabular text-right">
              {quote.collateralBps == null ? "—" : `${quote.collateralBps / 100}%`}
            </span>
            <span className="text-muted">Required lock</span>
            <span className="tabular text-right">{quote.requiredCollateral ?? "—"}</span>
            <span className="text-muted">APR</span>
            <span className="tabular text-right">
              {quote.interestBps == null ? "—" : `${quote.interestBps / 100}%`}
            </span>
            <span className="text-muted">Max on locked</span>
            <span className="tabular text-right">{quote.maxBorrow ?? "—"}</span>
          </div>
        </Card>
        {!quote.ready ? (
          <p className="text-[13px] text-muted">Enter a valid borrow amount to get a quote.</p>
        ) : !quote.requiredOk ? (
          <p className="text-[13px] font-medium text-bronze">
            Thin collateral — lock {quote.requiredCollateral ?? "more"} or borrow less.
          </p>
        ) : null}
        {borrowError ? (
          <p className="text-[13px] font-medium text-bronze">Borrow failed: {borrowError}</p>
        ) : null}
        {borrowDone && borrowHash ? (
          <div className="rounded-lg border border-line bg-paper p-3">
            <p className="text-[13px] font-medium text-platinum">Borrowed — position updated below.</p>
            <p className="tabular mt-1 break-all font-mono text-[12px] text-muted">{borrowHash}</p>
            <a
              href={explorerTx(borrowHash)}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block font-mono text-[12px] text-gold-deep underline underline-offset-2 hover:text-ink"
            >
              View on explorer ↗
            </a>
          </div>
        ) : null}
        <Btn disabled={!quote.ready || !quote.requiredOk || borrowBusy} onClick={onBorrow}>
          {borrowBusy ? "Borrowing…" : "Borrow mUSDC"}
        </Btn>
      </div>
    </Card>
  );
}
