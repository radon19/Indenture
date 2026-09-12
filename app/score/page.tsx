"use client";

import { useEffect, useRef, useState } from "react";
import { SectionHeading } from "../components/ui";
import NetworkGate from "../components/NetworkGate";
import CheckCard from "./CheckCard";
import ProveCard, { type SubmitView } from "./ProveCard";
import { ADDRESSES } from "../lib/site";
import { creditScoreAbi } from "../lib/abi";
import { useCreditScore } from "../lib/stubs";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSimulateContract } from "wagmi";
import { creditCoin3Testnet } from "wagmi/chains";

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
  const [queryError, setQueryError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState("");
  const [chainKey, setChainKey] = useState<1 | 3>(3);
  const [txHash, setTxHash] = useState("");
  const [checked, setChecked] = useState<Checked | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const { address } = useAccount();
  const { data: credit, isLoading } = useCreditScore(submitted || undefined);

  // Takes the address textbox, validates shape, submits it for score lookup.
  function handleLookup() {
    if (!/^0x[0-9a-fA-F]{40}$/.test(query.trim())) {
      setQueryError("that doesn't look like an address (0x followed by 40 hex characters)");
      return;
    }
    setQueryError(null);
    setSubmitted(query.trim());
  }

  // Takes the tx hash textbox, asks /api/prove, stores the checked proof.
  async function checkTx() {
    const hash = txHash.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
      setChecked(null);
      setCheckError("that doesn't look like a transaction hash (0x followed by 64 hex characters)");
      return;
    }
    resetExec();
    setTimedOut(false);
    setSubmitError(null);
    setSimSlow(false);
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
      if (typeof body.checkedAt !== "number") throw new Error("prover response malformed — update the worker");
      setChecked({ ...(body as Omit<Checked, "checkedAt">), checkedAt: body.checkedAt });
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

  const [timedOut, setTimedOut] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [simSlow, setSimSlow] = useState(false);
  const recordedRef = useRef<string | null>(null);

  const { data: execHash, error: execError, isPending: execPending, writeContract: execute, reset: resetExec } =
    useWriteContract();
  const { data: execReceipt, isLoading: execMining, isSuccess: execReceived } =
    useWaitForTransactionReceipt({
      hash: execHash,
    });
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
  void startOver;

  const execDone = execReceived && execReceipt?.status !== "reverted";
  const execReverted = execReceived && execReceipt?.status === "reverted";
  const execAlreadyRecorded =
    !!execError && /alread.*process/i.test(execError.message.split("\n")[0]);
  const execFailed = timedOut || submitError !== null || (execError && !execAlreadyRecorded) || execReverted;
  const execTooLarge =
    !!execError && /request too large/i.test(execError.message.split("\n")[0]);
  const submitting = active && !timedOut && !execReceived && !execError && submitError === null;

  const { error: simError, isLoading: simLoading, data: simData } = useSimulateContract({
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

  // Silence breaker: 45s with neither verdict nor error means the RPC is
  // hanging, not thinking. Cleanup on re-check swaps the timer, so a late
  // timer from a previous check can never flip a newer one.
  useEffect(() => {
    if (!checked || simError || simData !== undefined) return;
    const t = setTimeout(() => setSimSlow(true), 45_000);
    return () => clearTimeout(t);
  }, [checked, simError, simData]);

  // Simulation verdict drives the UI directly: no wallet needed to know.
  const simFailed = !!simError;
  const simReason = simFailed ? simError.message.split("\n").map((l) => l.trim()).filter(Boolean)[0] ?? "" : "";
  const simRecorded = simFailed && /alread.*process/i.test(simError.message);

  // Takes the checked proof, validates freshness + shape, sends execute().
  function handleSubmit() {
    if (!address || !checked || submitting || (simLoading && !simSlow)) return;
    if (Date.now() - checked.checkedAt > PROOF_TTL_MS) {
      setSubmitError("this proof is stale — press Check again for a fresh one, then submit promptly");
      return;
    }
    setSubmitError(null);
    resetExec();
    if (simFailed) return; // verdict already rendered; don't reopen the wallet
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
        execHash,
      }),
    }).catch(() => {
      recordedRef.current = null; // let a later render retry
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execDone, execHash]);

  const explorerTx = (hash: `0x${string}`) =>
    `${creditCoin3Testnet.blockExplorers.default.url}/tx/${hash}`;

  function handleTxHashChange(v: string) {
    setTxHash(v);
    setChecked(null);
    setCheckError(null);
    setSubmitError(null);
    setTimedOut(false);
    setSimSlow(false);
    resetExec();
  }

  const terminal =
    execAlreadyRecorded || execDone || simFailed || execFailed || simRecorded;
  const submit: SubmitView = !checked
    ? { mode: "unknown" }
    : terminal
      ? {
          mode: "close",
          note:
            (simRecorded || execAlreadyRecorded) && !execDone
              ? "txn is already processed"
              : simFailed && !execDone && !execFailed
                ? simReason.slice(0, 90) || "simulation failed"
                : null,
        }
      : checked.summary.protocol === "unknown"
        ? { mode: "unknown" }
        : {
          mode: "submit",
          disabled: !address || submitting || (simLoading && !simSlow),
          label: !address
            ? "Connect wallet to submit"
            : simLoading && !simSlow
              ? "Simulating…"
              : submitting
                ? "Submitting…"
                : simSlow && !simFailed
                  ? "Submit anyway"
                  : "Submit on-chain",
        };

  const slowNote = simSlow && !simFailed && !execDone;  const thanks =
    execAlreadyRecorded || execDone || simRecorded
      ? {
          title: "Thank you for proving — the record is stronger for it.",
          body: execDone
            ? "Your proof verified on-chain and the borrower's history is updated. Every honest proof makes permissionless credit more accurate."
            : "This history was already recorded — no gas wasted, nothing lost. Thanks for keeping the record honest anyway.",
        }
      : null;

  const failure = !thanks && execFailed
    ? {
        title: timedOut
          ? "Still waiting on the wallet."
          : execReverted
            ? "Transaction reverted on-chain."
            : "Submission failed before reaching chain.",
        body: timedOut
          ? "No answer in 150 seconds — the wallet window may have died silently. Close it, then start over with a fresh proof (proofs expire, so re-check first)."
          : execReverted
            ? "The most common cause is a proof that was already ingested — check the receipt, then close and look the score up again."
            : execTooLarge
              ? "This proof is too big for the wallet to relay (large receipts make large payloads). Submit it from the worker instead: bun worker.ts <txHash> --chain 3 — same proof, no size limit."
              : `${(submitError ?? (simFailed && !simRecorded ? simError?.message.split("\n")[0] : undefined) ?? execError?.message.split("\n")[0] ?? "Unknown wallet error.").slice(0, 160)} Nothing was ingested; the proof stays retryable.`,
        hash: execHash,
      }
    : null;

  return (
    <NetworkGate>
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <SectionHeading
        kicker="Score"
        title="Check it. Prove it."
        lede="Look up any address, or submit a proof. The borrower is read from the receipt — never from you."
      />

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <CheckCard
          query={query}
          setQuery={setQuery}
          queryError={queryError}
          submitted={submitted}
          credit={credit}
          isLoading={isLoading}
          onLookup={handleLookup}
        />
        <ProveCard
          chainKey={chainKey}
          setChainKey={setChainKey}
          txHash={txHash}
          onTxHashChange={handleTxHashChange}
          checking={checking}
          checkError={checkError}
          checked={checked}
          onCheck={checkTx}
          submit={submit}
          thanks={thanks}
          failure={failure}
          explorerUrl={explorerTx}
          execHash={execHash}
          onClose={() => window.location.reload()}
          onSubmit={handleSubmit}
          showSlowNote={slowNote}
        />
      </div>
    </div>
    </NetworkGate>
  );
}
