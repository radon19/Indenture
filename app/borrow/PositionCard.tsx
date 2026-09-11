"use client";

import { Card, Field, TextInput, Btn, TierBadge, EmptyState, type TierName } from "../components/ui";
import { formatUnits } from "viem";

function Receipt({
  title,
  hash,
  explorerTx,
}: {
  title: string;
  hash: `0x${string}`;
  explorerTx: (h: `0x${string}`) => string;
}) {
  return (
    <div className="rounded-lg border border-line bg-paper p-3">
      <p className="text-[13px] font-medium text-platinum">{title}</p>
      <p className="tabular mt-1 break-all font-mono text-[12px] text-muted">{hash}</p>
      <a
        href={explorerTx(hash)}
        target="_blank"
        rel="noreferrer"
        className="mt-1 inline-block font-mono text-[12px] text-gold-deep underline underline-offset-2 hover:text-ink"
      >
        View on explorer ↗
      </a>
    </div>
  );
}

export type PositionView = {
  collateral: string | null;
  debt: string | null;
  rate: number | null;
};

export default function PositionCard({
  tier,
  position,
  owed,
  repayAmount,
  setRepayAmount,
  needsApproval,
  repayReady,
  approveBusy,
  onApprove,
  repayBusy,
  onRepay,
  repayError,
  repayHash,
  repayConfirmed,
  showWithdraw,
  withdrawAmount,
  setWithdrawAmount,
  withdrawMax,
  withdrawReady,
  withdrawBusy,
  onWithdraw,
  withdrawError,
  withdrawHash,
  explorerTx,
}: {
  tier: TierName | null;
  position: PositionView;
  owed: bigint | undefined;
  repayAmount: string;
  setRepayAmount: (v: string) => void;
  needsApproval: boolean;
  repayReady: boolean;
  approveBusy: boolean;
  onApprove: () => void;
  repayBusy: boolean;
  onRepay: () => void;
  repayError: string | null;
  repayHash: `0x${string}` | undefined;
  repayConfirmed: boolean;
  showWithdraw: boolean;
  withdrawAmount: string;
  setWithdrawAmount: (v: string) => void;
  withdrawMax: string | null;
  withdrawReady: boolean;
  withdrawBusy: boolean;
  onWithdraw: () => void;
  withdrawError: string | null;
  withdrawHash: `0x${string}` | undefined;
  explorerTx: (h: `0x${string}`) => string;
}) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold tracking-tight">Your position</h3>
        {tier ? <TierBadge tier={tier} size="sm" /> : null}
      </div>
      {position.debt == null ? (
        <div className="mt-4">
          <EmptyState
            title="No open position"
            body="Borrow above to open one. Repayments and withdrawals land here."
          />
        </div>
      ) : (
        <div className="tabular mt-4 grid grid-cols-3 gap-3 font-mono text-[14px]">
          <div>
            <p className="text-faint text-[12px]">LOCKED</p>
            <p>{position.collateral}</p>
          </div>
          <div>
            <p className="text-faint text-[12px]">REMAINING</p>
            <p>{owed === undefined ? "—" : `${formatUnits(owed, 6)} mUSDC`}</p>
          </div>
          <div>
            <p className="text-faint text-[12px]">RATE</p>
            <p>{position.rate == null ? "—" : `${position.rate / 100}%`}</p>
          </div>
        </div>
      )}
      <div className="mt-4 grid gap-4">
        <Field label="Repay amount (mUSDC)" hint="Interest is paid first, then principal.">
          <div className="flex gap-2">
            <TextInput
              value={repayAmount}
              onChange={(e) => setRepayAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
            />
            {needsApproval ? (
              <Btn variant="ink" disabled={!repayReady || approveBusy} onClick={onApprove}>
                {approveBusy ? "Approving…" : "Approve"}
              </Btn>
            ) : (
              <Btn variant="ink" disabled={!repayReady || repayBusy} onClick={onRepay}>
                {repayBusy ? "Repaying…" : "Repay"}
              </Btn>
            )}
          </div>
        </Field>
        {repayError ? (
          <p className="text-[13px] font-medium text-bronze">Repay failed: {repayError}</p>
        ) : null}
        {repayHash ? (
          <Receipt
            title={repayConfirmed ? "Repaid — position updated." : "Broadcast — confirming on-chain…"}
            hash={repayHash}
            explorerTx={explorerTx}
          />
        ) : null}
        {showWithdraw ? (
          <>
              <Field label="Withdraw collateral (CTC)" hint="Unlocks once nothing remains to pay.">
                <div className="flex gap-2">
                  <TextInput
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                  />
                  {withdrawMax ? (
                    <Btn
                      variant="ghost"
                      onClick={() => setWithdrawAmount(withdrawMax)}
                    >
                      Max
                    </Btn>
                  ) : null}
                  <Btn
                    variant="ink"
                    disabled={!withdrawReady || withdrawBusy}
                    onClick={onWithdraw}
                  >
                    {withdrawBusy ? "Withdrawing…" : "Withdraw"}
                  </Btn>
                </div>
              </Field>
            {withdrawError ? (
              <p className="text-[13px] font-medium text-bronze">Withdraw failed: {withdrawError}</p>
            ) : null}
            {withdrawHash ? (
              <Receipt title="Withdrawn — position updated." hash={withdrawHash} explorerTx={explorerTx} />
            ) : null}
          </>
        ) : null}
      </div>
    </Card>
  );
}
