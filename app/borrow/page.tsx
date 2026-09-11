"use client";

import { useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Card, SectionHeading, Field, TextInput, Btn, TierBadge, EmptyState } from "../components/ui";
import NetworkGate from "../components/NetworkGate";
import { TIERS } from "../lib/site";
import { ADDRESSES } from "../lib/site";
import { loanPoolAbi } from "../lib/abi";
import { useBorrowQuote, usePosition, useCreditScore } from "../lib/stubs";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { creditCoin3Testnet } from "wagmi/chains";
import { formatUnits, parseEther, parseUnits } from "viem";
import { mockUSDCAbi } from "../lib/abi";

export default function BorrowPage() {
  const { address, isConnected } =useAccount();
  const [debt, setDebt] = useState("100");
  const [locked, setLocked] = useState("150");
  const [repayAmount, setRepayAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");

  const { data: credit, isLoading: scoreLoading } = useCreditScore(isConnected ? address : undefined);
  const quote = useBorrowQuote(isConnected ? address : undefined, debt, locked);
  const position = usePosition(isConnected ? address : undefined);

  const { data: borrowHash, error: borrowError, isPending: borrowPending, writeContract: borrow } =
    useWriteContract();
  const { isLoading: borrowMining, isSuccess: borrowDone } = useWaitForTransactionReceipt({
    hash: borrowHash,
  });

  // Repay = approve mUSDC first, then repay (pool pulls via transferFrom).
  const repayWei = (() => {
    try {
      return repayAmount.trim() ? parseUnits(repayAmount.trim(), 6) : null;
    } catch {
      return null;
    }
  })();
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: ADDRESSES.creditcoinTestnet.mockUSDC,
    abi: mockUSDCAbi,
    functionName: "allowance",
    args: address ? [address, ADDRESSES.creditcoinTestnet.loanPool] : undefined,
    chainId: creditCoin3Testnet.id,
    query: { enabled: !!address },
  });
  const needsApproval =
    repayWei !== null && repayWei > BigInt(0) && (allowance === undefined || (allowance as bigint) < repayWei);
  const { data: approveHash, isPending: approvePending, writeContract: approve } = useWriteContract();
  const { isLoading: approveMining, isSuccess: approveDone } = useWaitForTransactionReceipt({
    hash: approveHash,
  });
  const { data: repayHash, error: repayError, isPending: repayPending, writeContract: repay } =
    useWriteContract();
  const { isLoading: repayMining, isSuccess: repayDone } = useWaitForTransactionReceipt({
    hash: repayHash,
  });

  const withdrawWei = (() => {
    try {
      return withdrawAmount.trim() ? parseEther(withdrawAmount.trim()) : null;
    } catch {
      return null;
    }
  })();
  const { data: withdrawHash, error: withdrawError, isPending: withdrawPending, writeContract: withdraw } =
    useWriteContract();
  const { isLoading: withdrawMining, isSuccess: withdrawDone } = useWaitForTransactionReceipt({
    hash: withdrawHash,
  });

  const { data: owed, refetch: refetchOwed } = useReadContract({
    address: ADDRESSES.creditcoinTestnet.loanPool,
    abi: loanPoolAbi,
    functionName: "totalOwed",
    args: address ? [address] : undefined,
    chainId: creditCoin3Testnet.id,
    query: { enabled: !!address },
  });
  const explorerTx = (hash?: `0x${string}`) =>
    `${creditCoin3Testnet.blockExplorers.default.url}/tx/${hash ?? ""}`;

  useEffect(() => {
    if (borrowDone) position.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [borrowDone]);

  useEffect(() => {
    if (approveDone) refetchAllowance();
    if (repayDone) {
      position.refetch();
      refetchAllowance();
      refetchOwed();
      setRepayAmount("");
    }
    if (withdrawDone) {
      position.refetch();
      refetchOwed();
      setWithdrawAmount("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveDone, repayDone, withdrawDone]);

  if (!isConnected) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <SectionHeading
          kicker="Borrow"
          title="Borrow against your reputation."
          lede="Connect a wallet to preview your tier, size a loan, and manage a position."
        />
        <Card className="mt-8 p-10 text-center">
          <p className="mx-auto max-w-sm text-[15px] leading-relaxed text-muted">
            Connect a wallet to read your score and position.
          </p>
          <div className="mt-5 flex justify-center">
            <ConnectButton />
          </div>
        </Card>
      </div>
    );
  }

  return (
    <NetworkGate>
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <SectionHeading
        kicker="Borrow"
        title="Borrow against your reputation."
        lede="Live tier prices everything. The chain decides."
      />

      {/* FETCHED CREDIT */}
      <Card className="mt-8 p-6">
        {scoreLoading ? (
          <p className="font-mono text-[13px] text-faint">Loading score…</p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-muted">Your tier</span>
              {credit.tier ? (
                <TierBadge tier={credit.tier} />
              ) : (
                <span className="rounded-full border border-dashed border-faint px-3 py-1 font-mono text-[12px] text-faint">
                  no history yet — Bronze terms
                </span>
              )}
            </div>
            {[
              ["Score", credit.score == null ? null : String(credit.score)],
              ["Capacity", credit.capacity],
              ["Max repay", credit.maxRepayment],
              ["Venues", credit.venues == null ? null : String(credit.venues)],
              ["Defaults", credit.defaults == null ? null : String(credit.defaults)],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">{label}</p>
                <p className="tabular mt-0.5 font-mono text-[15px] font-semibold">
                  {value ?? <span className="text-faint">—</span>}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {scoreLoading ? (
        <Card className="mt-4 p-10 text-center">
          <p className="font-mono text-[13px] text-faint">Loading score — borrow box appears when it lands…</p>
        </Card>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {/* BORROW */}
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold tracking-tight">New loan</h3>
              {credit.tier ? <TierBadge tier={credit.tier} size="sm" /> : null}
            </div>
            <div className="mt-4 grid gap-4">
              <div className="grid grid-cols-2 gap-4">
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
                <p className="text-[13px] font-medium text-bronze">
                  Borrow failed: {borrowError.message.split("\n")[0]}
                </p>
              ) : null}
              {borrowDone ? (
                <p className="text-[13px] font-medium text-platinum">
                  Borrowed — position updated below.
                </p>
              ) : null}
              <Btn
                disabled={!quote.ready || !quote.requiredOk || borrowPending || borrowMining}
                onClick={() => {
                  try {
                    borrow({
                      address: ADDRESSES.creditcoinTestnet.loanPool,
                      abi: loanPoolAbi,
                      functionName: "borrow",
                      args: [parseUnits(debt.trim(), 6)],
                      value: parseEther(locked.trim()),
                    });
                  } catch {
                    /* invalid input stays disabled via quote.ready */
                  }
                }}
              >
                {borrowPending || borrowMining ? "Borrowing…" : "Borrow mUSDC"}
              </Btn>
            </div>
          </Card>

          {/* POSITION */}
          <div className="grid gap-4">
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold tracking-tight">Your position</h3>
                {credit.tier ? <TierBadge tier={credit.tier} size="sm" /> : null}
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
                    <p>{owed === undefined ? "—" : `${formatUnits(owed as bigint, 6)} mUSDC`}</p>
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
                    <Btn
                      variant="ink"
                      disabled={repayWei === null || approvePending || approveMining}
                      onClick={() => {
                        if (repayWei === null) return;
                        approve({
                          address: ADDRESSES.creditcoinTestnet.mockUSDC,
                          abi: mockUSDCAbi,
                          functionName: "approve",
                          args: [ADDRESSES.creditcoinTestnet.loanPool, repayWei],
                        });
                      }}
                    >
                      {approvePending || approveMining ? "Approving…" : "Approve"}
                    </Btn>
                  ) : (
                    <Btn
                      variant="ink"
                      disabled={repayWei === null || repayWei <= BigInt(0) || repayPending || repayMining}
                      onClick={() => {
                        if (repayWei === null) return;
                        repay({
                          address: ADDRESSES.creditcoinTestnet.loanPool,
                          abi: loanPoolAbi,
                          functionName: "repay",
                          args: [repayWei],
                        });
                      }}
                    >
                      {repayPending || repayMining ? "Repaying…" : "Repay"}
                    </Btn>
                  )}
                </div>
              </Field>
              {repayError ? (
                <p className="text-[13px] font-medium text-bronze">
                  Repay failed: {repayError.message.split("\n")[0]}
                </p>
              ) : null}
              {repayDone && repayHash ? (
                <div className="rounded-lg border border-line bg-paper p-3">
                  <p className="text-[13px] font-medium text-platinum">Repaid — position updated.</p>
                  <p className="tabular mt-1 break-all font-mono text-[12px] text-muted">{repayHash}</p>
                  <a
                    href={explorerTx(repayHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block font-mono text-[12px] text-gold-deep underline underline-offset-2 hover:text-ink"
                  >
                    View on explorer ↗
                  </a>
                </div>
              ) : null}
              {owed !== undefined && (owed as bigint) === BigInt(0) ? (
              <>
              <Field label="Withdraw collateral (CTC)" hint="Unlocks once nothing remains to pay.">
                <div className="flex gap-2">
                  <TextInput
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                  />
                  <Btn
                    variant="ink"
                    disabled={withdrawWei === null || withdrawWei <= BigInt(0) || withdrawPending || withdrawMining}
                    onClick={() => {
                      if (withdrawWei === null) return;
                      withdraw({
                        address: ADDRESSES.creditcoinTestnet.loanPool,
                        abi: loanPoolAbi,
                        functionName: "withdrawCollateral",
                        args: [withdrawWei],
                      });
                    }}
                  >
                    {withdrawPending || withdrawMining ? "Withdrawing…" : "Withdraw"}
                  </Btn>
                </div>
              </Field>
              {withdrawError ? (
                <p className="text-[13px] font-medium text-bronze">
                  Withdraw failed: {withdrawError.message.split("\n")[0]}
                </p>
              ) : null}
              {withdrawDone && withdrawHash ? (
                <div className="rounded-lg border border-line bg-paper p-3">
                  <p className="text-[13px] font-medium text-platinum">Withdrawn — position updated.</p>
                  <p className="tabular mt-1 break-all font-mono text-[12px] text-muted">{withdrawHash}</p>
                  <a
                    href={explorerTx(withdrawHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block font-mono text-[12px] text-gold-deep underline underline-offset-2 hover:text-ink"
                  >
                    View on explorer ↗
                  </a>
                </div>
              ) : null}
              </>
              ) : null}
              </div>
            </Card>

            {/* RATES */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold tracking-tight">Rates by tier</h3>
              <table className="mt-3 w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-line font-mono text-[11px] uppercase tracking-[0.12em] text-faint">
                    <th className="py-2 pr-2 font-medium">Tier</th>
                    <th className="py-2 pr-2 font-medium">Collateral</th>
                    <th className="py-2 font-medium">APR</th>
                  </tr>
                </thead>
                <tbody className="tabular font-mono">
                  {TIERS.map((t) => (
                    <tr key={t.name} className="border-b border-line/60 last:border-0">
                      <td className="py-2 pr-2">
                        <TierBadge tier={t.name} size="sm" />
                      </td>
                      <td className="py-2 pr-2">{t.collateral}</td>
                      <td className="py-2">{t.apr}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </div>
      )}
    </div>
    </NetworkGate>
  );
}
