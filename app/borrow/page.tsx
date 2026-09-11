"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Card, SectionHeading, TierBadge } from "../components/ui";
import NetworkGate from "../components/NetworkGate";
import BorrowForm from "./BorrowForm";
import PositionCard from "./PositionCard";
import { TIERS } from "../lib/site";
import { ADDRESSES } from "../lib/site";
import { loanPoolAbi, mockUSDCAbi } from "../lib/abi";
import { useBorrowQuote, usePosition, useCreditScore } from "../lib/stubs";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { creditCoin3Testnet } from "wagmi/chains";
import { parseEther, parseUnits } from "viem";

export default function BorrowPage() {
  const { address, isConnected } = useAccount();
  const [debt, setDebt] = useState("100");
  const [locked, setLocked] = useState("150");
  const [repayAmount, setRepayAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");

  const { data: credit, isLoading: scoreLoading } = useCreditScore(isConnected ? address : undefined);
  const liveTier = credit.tier;
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
  const { isLoading: approveMining } = useWaitForTransactionReceipt({ hash: approveHash });
  const approveDone = !!approveHash && !approvePending && !approveMining;
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
  const explorerTx = (hash: `0x${string}`) =>
    `${creditCoin3Testnet.blockExplorers.default.url}/tx/${hash}`;

  function handleBorrow() {
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
  }

  function handleApprove() {
    if (repayWei === null) return;
    approve({
      address: ADDRESSES.creditcoinTestnet.mockUSDC,
      abi: mockUSDCAbi,
      functionName: "approve",
      args: [ADDRESSES.creditcoinTestnet.loanPool, repayWei],
    });
  }

  function handleRepay() {
    if (repayWei === null) return;
    repay({
      address: ADDRESSES.creditcoinTestnet.loanPool,
      abi: loanPoolAbi,
      functionName: "repay",
      args: [repayWei],
    });
  }

  function handleWithdraw() {
    if (withdrawWei === null) return;
    withdraw({
      address: ADDRESSES.creditcoinTestnet.loanPool,
      abi: loanPoolAbi,
      functionName: "withdrawCollateral",
      args: [withdrawWei],
    });
  }

  // Post-success cleanup lives in events, not effects: refetching is the
  // effect's sync-with-external-system job, input resets are event logic.
  const onBorrowSettled = useEffectEvent(() => {
    pollRefetch(position.refetch, refetchOwed);
  });
  useEffect(() => {
    if (borrowDone) onBorrowSettled();
  }, [borrowDone]);

  const onApproveSettled = useEffectEvent(() => {
    refetchAllowance();
  });
  useEffect(() => {
    if (approveDone) onApproveSettled();
  }, [approveDone]);

  // Post-success input resets: the canonical "adjust state when an async
  // operation completes" case (React docs' own useEffectEvent example).
  // Refetches poll because indexers lag receipts by seconds.
  const pollRefetch = useEffectEvent((...fns: (() => void)[]) => {
    fns.forEach((fn) => fn());
    [2000, 5000, 10000].forEach((ms) =>
      setTimeout(() => fns.forEach((fn) => fn()), ms),
    );
  });
  const onRepaySettled = useEffectEvent(() => {
    pollRefetch(position.refetch, refetchAllowance, refetchOwed);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRepayAmount("");
  });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (repayDone) onRepaySettled();
  }, [repayDone]);

  const onWithdrawSettled = useEffectEvent(() => {
    pollRefetch(position.refetch, refetchOwed);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWithdrawAmount("");
  });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (withdrawDone) onWithdrawSettled();
  }, [withdrawDone]);

  // Sticky-upward collateral: raising the borrow auto-fills the lock to the
  // requirement; lowering never takes collateral away.
  const bumpCollateral = useEffectEvent((need: number) => {
    const cur = Number.parseFloat(locked);
    if (!Number.isFinite(cur) || cur < need) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocked(String(need));
    }
  });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (quote.requiredCtC != null) bumpCollateral(quote.requiredCtC);
  }, [quote.requiredCtC]);

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
          <BorrowForm
            tier={liveTier}
            debt={debt}
            setDebt={setDebt}
            locked={locked}
            setLocked={setLocked}
            quote={quote}
            borrowError={borrowError ? borrowError.message.split("\n")[0] : null}
            borrowDone={borrowDone}
            borrowBusy={borrowPending || borrowMining}
            onBorrow={handleBorrow}
            borrowHash={borrowHash}
            explorerTx={explorerTx}
          />

          <div className="grid gap-4">
            <PositionCard
              tier={liveTier}
              position={position}
              owed={owed as bigint | undefined}
              repayAmount={repayAmount}
              setRepayAmount={setRepayAmount}
              needsApproval={needsApproval}
              repayReady={repayWei !== null && repayWei > BigInt(0)}
              approveBusy={approvePending || approveMining}
              onApprove={handleApprove}
              repayBusy={repayPending || repayMining}
              onRepay={handleRepay}
              repayError={repayError ? repayError.message.split("\n")[0] : null}
              repayHash={repayHash}
              repayConfirmed={repayDone}
              showWithdraw={owed !== undefined && (owed as bigint) === BigInt(0)}
              withdrawAmount={withdrawAmount}
              setWithdrawAmount={setWithdrawAmount}
              withdrawMax={position.collateral == null ? null : position.collateral.split(" ")[0]}
              withdrawReady={withdrawWei !== null && withdrawWei > BigInt(0)}
              withdrawBusy={withdrawPending || withdrawMining}
              onWithdraw={handleWithdraw}
              withdrawError={withdrawError ? withdrawError.message.split("\n")[0] : null}
              withdrawHash={withdrawDone ? withdrawHash : undefined}
              explorerTx={explorerTx}
            />

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
