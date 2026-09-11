"use client";

import { useEffect, useRef, useState } from "react";
import { Card, SectionHeading, Field, TextInput, Btn, EmptyState, TierBadge } from "../components/ui";
import type { TierName } from "../lib/site";
import NetworkGate from "../components/NetworkGate";
import { ADDRESSES } from "../lib/site";
import { creditScoreAbi } from "../lib/abi";
import { useCreditScore } from "../lib/stubs";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSimulateContract } from "wagmi";
import { creditCoin3Testnet } from "wagmi/chains";
import { formatUnits } from "viem";

const TIER_BG: Record<TierName, string> = {
  Bronze: "bg-[#26211b]",
  Silver: "bg-[#22262c]",
  Gold: "bg-[#2a2417]",
  Platinum: "bg-[#1c2723]",
};

const usd = (raw: string | null) => {
  if (raw == null) return "—";
  try {
    const [whole, frac = ""] = formatUnits(BigInt(raw), 18).split(".");
    const grouped = Number(whole).toLocaleString("en-US");
    return frac.slice(0, 2) === "00" || frac === "" ? `$${grouped}` : `$${grouped}.${frac.slice(0, 2)}`;
  } catch {
    return "—";
  }
};

type Checked = {
  summary: {
    txHash: string;
    blockNumber: number;
    protocol: string;
    kind: string;
    borrower: string | null;
    amountRaw: string | null;
  };
  execute: {
    action: number;
    chainKey: number;
    blockHeight: number;
    encodedTransaction: `0x${string}`;
    merkleRoot: `0x${string}`;
    siblings: { hash: `0x${string}`; isLeft: boolean }[];
    lowerEndpointDigest: `0x${string}`;
    continuityRoots: `0x${string}`[];
  };
  checkedAt: number;
};

// Proofs rot as attestation advances: a proof older than this must be re-checked.
const PROOF_TTL_MS = 5 * 60 * 1000;

export default function ScorePage() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [queryError, setQueryError] = useState<string | null>(null);
  const [chainKey, setChainKey] = useState<1 | 3>(3);
  const [txHash, setTxHash] = useState("");
  const [checked, setChecked] = useState<Checked | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const { address } = useAccount();
  const { data: credit, isLoading } = useCreditScore(submitted || undefined);

  async function checkTx() {
    const hash = txHash.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
      setChecked(null);
      setCheckError("that doesn't look like a transaction hash (0x followed by 64 hex characters)");
      return;
    }
    resetExec(); // a previous ingest's thanks must never survive into a new check
    setTimedOut(false);
    setSubmitError(null);
    setChecking(true);
    setCheckError(null);
    setChecked(null);
    try {
      const res = await fetch("/api/prove", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chainKey, txHash: hash }),
      });
      const body = await res.json().catch(() => null);
      if (!body?.ok) throw new Error(body?.error ?? "something went wrong checking this transaction");
      setChecked({ ...(body as Omit<Checked, "checkedAt">), checkedAt: Date.now() });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setCheckError(
        /failed to fetch|networkerror|load failed/i.test(msg)
          ? "can't reach the prover — is the worker running?"
          : msg.split("\n")[0].slice(0, 160) || "something went wrong checking this transaction",
      );
    } finally {
      setChecking(false);
    }
  }

  const { data: execHash, error: execError, isPending: execPending, writeContract: execute, reset: resetExec } =
    useWriteContract();  const { data: execReceipt, isLoading: execMining, isSuccess: execReceived } =
    useWaitForTransactionReceipt({
      hash: execHash,
    });

  // Explicit machine: wagmi flags alone can stick (wallet windows that die
  // silently), so every terminal state is derived AND watchdog-timed.
  const [timedOut, setTimedOut] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const recordedRef = useRef<string | null>(null);
  const active = execPending || execMining;
  useEffect(() => {
    if (!active) return;
    setTimedOut(false);
    const t = setTimeout(() => setTimedOut(true), 150_000);
    return () => clearTimeout(t);
  }, [active, execHash]);

  function startOver() {
    resetExec();
    setTimedOut(false);
  }

  const execDone = execReceived && execReceipt?.status !== "reverted";
  const execReverted = execReceived && execReceipt?.status === "reverted";
  const execAlreadyRecorded =
    !!execError && /alread.*process/i.test(execError.message.split("\n")[0]);
  const execFailed = timedOut || submitError !== null || (execError && !execAlreadyRecorded) || execReverted;
  const execTooLarge =
    !!execError && /request too large/i.test(execError.message.split("\n")[0]);
  const submitting = active && !timedOut && !execReceived && !execError && submitError === null;

  /** Single entry point for submission: validates, sends, and owns every outcome. */
  function handleSubmit() {
    if (!address || !checked || submitting || simLoading) return;
    if (Date.now() - checked.checkedAt > PROOF_TTL_MS) {
      setSubmitError("this proof is stale — press Check again for a fresh one, then submit promptly");
      return;
    }
    if (checked.summary.protocol === "unknown") return; // nothing recognizable — button stays hidden anyway
    setSubmitError(null);
    resetExec();
    if (simFailed) {
      // Simulation already rendered its verdict below; don't reopen the wallet.
      if (!simRecorded) {
        setSubmitError(simError ? simError.message.split("\n")[0].slice(0, 160) : "chain refuses this proof");
      }
      return;
    }
    const x = checked.execute;
    if (
      !Number.isSafeInteger(x.blockHeight) ||
      !x.encodedTransaction?.startsWith("0x") ||
      !x.merkleRoot?.startsWith("0x") ||
      !x.lowerEndpointDigest?.startsWith("0x")
    ) {
      setSubmitError("the proof payload is malformed — re-check the transaction for a fresh one");
      return;
    }
    if (simError) {
      // Simulation already knows the outcome — never open the wallet for a doomed tx.
      // (Rendered directly from simFailed below; nothing to do on click.)
      return;
    }
    try {
      execute({
        address: ADDRESSES.creditcoinTestnet.creditScore,
        abi: creditScoreAbi,
        functionName: "execute",
        args: [
          x.action,
          BigInt(x.chainKey),
          BigInt(x.blockHeight),
          x.encodedTransaction,
          x.merkleRoot,
          x.siblings,
          x.lowerEndpointDigest,
          x.continuityRoots,
        ],
      });
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message.split("\n")[0] : String(e));
    }
  }

  // Dry-run the exact calldata on every checked proof: doomed txs surface here,
  // with names, instead of dying silently inside the wallet.
  const { error: simError, isLoading: simLoading } = useSimulateContract({
    address: ADDRESSES.creditcoinTestnet.creditScore,
    abi: creditScoreAbi,
    functionName: "execute",
    args: checked
      ? [
          checked.execute.action,
          BigInt(checked.execute.chainKey),
          BigInt(checked.execute.blockHeight),
          checked.execute.encodedTransaction,
          checked.execute.merkleRoot,
          checked.execute.siblings,
          checked.execute.lowerEndpointDigest,
          checked.execute.continuityRoots,
        ]
      : undefined,
    chainId: creditCoin3Testnet.id,
    query: { enabled: !!checked },
  });

  // After a successful ingest, file it in evidence (once per proof).
  useEffect(() => {
    if (!execDone || !checked || !execHash || recordedRef.current === execHash) return;
    recordedRef.current = execHash;
    fetch("/api/evidence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        txHash: checked.summary.txHash,
        chainKey: checked.execute.chainKey,
        protocol: checked.summary.protocol,
        kind: checked.summary.kind,
        borrower: checked.summary.borrower,
        amountRaw: checked.summary.amountRaw,
        blockNumber: checked.summary.blockNumber,
      }),
    }).catch(() => {
      recordedRef.current = null; // let a later render retry
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execDone, execHash]);

  // Simulation verdict drives the UI directly: no wallet needed to know.
  const simFailed = !!simError;
  const simReason = simFailed ? simError.message.split("\n").map((l) => l.trim()).filter(Boolean)[0] ?? "" : "";
  const simRecorded = simFailed && /alread.*process/i.test(simError.message);

  return (
    <NetworkGate>
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <SectionHeading
        kicker="Score"
        title="Check it. Prove it."
        lede="Look up any address, or submit a proof. The borrower is read from the receipt — never from you."
      />

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {/* CHECK */}
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
                <Btn
                  variant="ink"
                  onClick={() => {
                    if (!/^0x[0-9a-fA-F]{40}$/.test(query.trim())) {
                      setQueryError("that doesn't look like an address (0x followed by 40 hex characters)");
                      return;
                    }
                    setQueryError(null);
                    setSubmitted(query.trim());
                  }}
                >
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
                <div className="mx-auto w-full max-w-[240px] rounded-xl border border-paper/15 bg-ink/60 p-6 text-center">
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

        {/* PROVE */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold tracking-tight">Prove history</h3>
          <div className="mt-3 flex gap-2" role="group" aria-label="Source chain">
            {(
              [
                { id: 3 as const, label: "Ethereum mainnet" },
                { id: 1 as const, label: "Sepolia" },
              ]
            ).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setChainKey(c.id)}
                aria-pressed={chainKey === c.id}
                className={`rounded-full border px-3 py-1 text-[13px] font-medium transition-colors ${
                  chainKey === c.id
                    ? "border-ink bg-ink text-paper"
                    : "border-line bg-paper text-muted hover:text-ink"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <ol className="mt-3 space-y-2 text-[14px] text-muted">
            {[
              "Fetch the source receipt (Aave, Spark, Compound, or the Sepolia ledger).",
              "Wrap it in the prover payload envelope.",
              "Submit — the registry verifies inclusion and scores the borrower.",
            ].map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="font-mono text-[13px] text-gold-deep">{`0${i + 1}`}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <div className="mt-4">
            <Field label="Source transaction hash">
              <div className="flex gap-2">
                <TextInput
                  value={txHash}
                  onChange={(e) => {
                    setTxHash(e.target.value);
                    setChecked(null);
                    setCheckError(null);
                    setSubmitError(null);
                    setTimedOut(false);
                    resetExec();
                  }}
                  placeholder="0x…"
                  spellCheck={false}
                />
                <Btn variant="ink" disabled={checking || !txHash.trim()} onClick={checkTx}>
                  {checking ? "Checking…" : "Check"}
                </Btn>
              </div>
            </Field>
          </div>
          {checkError ? (
            <p className="mt-3 text-[13px] font-medium text-bronze">{checkError}</p>
          ) : null}
          {checked ? (
            <Card className="mt-4 border-dashed bg-paper p-4">
              <div className="grid grid-cols-2 gap-3 font-mono text-[13px]">
                <span className="text-muted">Protocol</span>
                <span className="tabular text-right">{checked.summary.protocol}</span>
                <span className="text-muted">Kind</span>
                <span className="tabular text-right">{checked.summary.kind}</span>
                <span className="text-muted">Borrower</span>
                <span className="tabular break-all text-right">{checked.summary.borrower ?? "—"}</span>
                <span className="text-muted">Amount (raw)</span>
                <span className="tabular text-right">{checked.summary.amountRaw ?? "—"}</span>
                <span className="text-muted">Source block</span>
                <span className="tabular text-right">{checked.summary.blockNumber}</span>
              </div>
              <div className="mt-4 flex items-center gap-3">
                {execAlreadyRecorded || execDone || simFailed || execFailed ? (
                  <div className="flex items-center gap-3">
                    <Btn
                      variant="ghost"
                      onClick={() => window.location.reload()}
                    >
                      Close
                    </Btn>
                    {(simRecorded || execAlreadyRecorded) && !execDone ? (
                      <p className="font-mono text-[12px] text-muted">
                        txn is already processed
                      </p>
                    ) : execTooLarge ? (
                      <p className="font-mono text-[12px] text-muted">
                        req too large, can't sign
                      </p>
                    ) : simFailed && !execDone ? (
                      <p className="max-w-[220px] font-mono text-[12px] text-muted">
                        {simReason.slice(0, 90) || "simulation failed"}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  checked.summary.protocol === "unknown" ? (
                  <p className="max-w-md text-[13px] leading-relaxed text-muted">
                    Nothing recognizable in this transaction — no log from a
                    registered source (Aave, Spark, Compound, Sepolia ledger).
                    Submitting would revert; try a repayment or liquidation hash.
                  </p>
                ) : (
                  <Btn
                    disabled={!address || submitting || simLoading}
                    onClick={handleSubmit}
                  >
                    {!address
                      ? "Connect wallet to submit"
                      : simLoading
                        ? "Simulating…"
                        : submitting
                          ? "Submitting…"
                          : "Submit on-chain"}
                  </Btn>
                )
                )}
                {execAlreadyRecorded || execDone || simRecorded ? (
                  <div className="rounded-lg border border-line bg-paper p-4">
                    <p className="text-[15px] font-semibold tracking-tight">
                      Thank you for proving — the record is stronger for it.
                    </p>
                    <p className="mt-1 max-w-md text-[13px] leading-relaxed text-muted">
                      {execDone
                        ? "Your proof verified on-chain and the borrower's history is updated. Every honest proof makes permissionless credit more accurate."
                        : "This history was already recorded — no gas wasted, nothing lost. Thanks for keeping the record honest anyway."}
                    </p>
                  </div>
                ) : execFailed ? (
                  <div className="rounded-lg border border-line bg-paper p-4">
                    <p className="text-[15px] font-semibold tracking-tight">
                      {timedOut
                        ? "Still waiting on the wallet."
                        : execReverted
                          ? "Transaction reverted on-chain."
                          : "Submission failed before reaching chain."}
                    </p>
                    <p className="mt-1 max-w-md text-[13px] leading-relaxed text-muted">
                      {timedOut
                        ? "No answer in 150 seconds — the wallet window may have died silently. Close it, then start over with a fresh proof (proofs expire, so re-check first)."
                        : execReverted
                          ? "The most common cause is a proof that was already ingested — check the receipt, then close and look the score up again."
                          : execTooLarge
                            ? "This proof is too big for the wallet to relay (large receipts make large payloads). Submit it from the worker instead: bun worker.ts <txHash> --chain 3 — same proof, no size limit."
                            : `${(submitError ?? (simFailed && !simRecorded ? simError?.message.split("\n")[0] : undefined) ?? execError?.message.split("\n")[0] ?? "Unknown wallet error.").slice(0, 160)} Nothing was ingested; the proof stays retryable.`}
                    </p>
                    {execHash ? (
                      <a
                        href={`${creditCoin3Testnet.blockExplorers.default.url}/tx/${execHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block font-mono text-[12px] text-gold-deep underline underline-offset-2 hover:text-ink"
                      >
                        Inspect on explorer ↗
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {execDone && execHash ? (
                <a
                  href={`${creditCoin3Testnet.blockExplorers.default.url}/tx/${execHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block font-mono text-[12px] text-gold-deep underline underline-offset-2 hover:text-ink"
                >
                  View on explorer ↗
                </a>
              ) : null}
            </Card>
          ) : null}
        </Card>
      </div>
    </div>
    </NetworkGate>
  );
}
