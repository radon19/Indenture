"use client";

import { Card, Field, TextInput, Btn } from "../components/ui";

export type CheckedProof = {
  summary: {
    txHash: string;
    blockNumber: number;
    protocol: string;
    kind: string;
    borrower: string | null;
    amountRaw: string | null;
  };
  execute: unknown;
};

export type SubmitView =
  | { mode: "close"; note: string | null }
  | { mode: "unknown" }
  | {
      mode: "submit";
      disabled: boolean;
      label: string;
    };

// Check → submit card. Takes chain/tx state + callbacks, renders the proof
// steps, the checked summary, and the submit / thanks / failure views.
export default function ProveCard({
  chainKey,
  setChainKey,
  txHash,
  onTxHashChange,
  checking,
  checkError,
  checked,
  onCheck,
  submit,
  thanks,
  failure,
  explorerUrl,
  execHash,
  onClose,
  onSubmit,
  showSlowNote,
}: {
  chainKey: 1 | 3;
  setChainKey: (c: 1 | 3) => void;
  txHash: string;
  onTxHashChange: (v: string) => void;
  checking: boolean;
  checkError: string | null;
  checked: CheckedProof | null;
  onCheck: () => void;
  submit: SubmitView;
  thanks: { title: string; body: string } | null;
  failure:
    | { title: string; body: string; hash: `0x${string}` | undefined }
    | null;
  explorerUrl: (hash: `0x${string}`) => string;
  execHash: `0x${string}` | undefined;
  onClose: () => void;
  onSubmit: () => void;
  showSlowNote: boolean;
}) {
  return (
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
          <div className="flex flex-col gap-2 sm:flex-row">
            <TextInput
              value={txHash}
              onChange={(e) => onTxHashChange(e.target.value)}
              placeholder="0x…"
              spellCheck={false}
            />
            <Btn variant="ink" className="w-full sm:w-auto" disabled={checking || !txHash.trim()} onClick={onCheck}>
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
            {submit.mode === "close" ? (
              <div className="flex items-center gap-3">
                <Btn variant="ghost" onClick={onClose}>
                  Close
                </Btn>
                {submit.note ? (
                  <p className="max-w-55 font-mono text-[12px] text-muted">{submit.note}</p>
                ) : null}
              </div>
            ) : submit.mode === "unknown" ? (
              <p className="max-w-md text-[13px] leading-relaxed text-muted">
                Nothing recognizable in this transaction — no log from a
                registered source (Aave, Spark, Compound, Sepolia ledger).
                Submitting would revert; try a repayment or liquidation hash.
              </p>
            ) : (
              <Btn disabled={submit.disabled} onClick={onSubmit}>
                {submit.label}
              </Btn>
            )}
          </div>
          {submit.mode === "submit" && showSlowNote ? (
            <p className="mt-2 max-w-md font-mono text-[12px] text-muted">
              no answer in 45s — the chain is slow, not necessarily wrong. Submitting skips the safety check at your own gas risk.
            </p>
          ) : null}
          {thanks ? (
            <div className="rounded-lg border border-line bg-paper p-4">
              <p className="text-[15px] font-semibold tracking-tight">{thanks.title}</p>
              <p className="mt-1 max-w-md text-[13px] leading-relaxed text-muted">{thanks.body}</p>
            </div>
          ) : failure ? (
            <div className="rounded-lg border border-line bg-paper p-4">
              <p className="text-[15px] font-semibold tracking-tight">{failure.title}</p>
              <p className="mt-1 max-w-md text-[13px] leading-relaxed text-muted">{failure.body}</p>
              {failure.hash ? (
                <a
                  href={explorerUrl(failure.hash)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block font-mono text-[12px] text-gold-deep underline underline-offset-2 hover:text-ink"
                >
                  Inspect on explorer ↗
                </a>
              ) : null}
            </div>
          ) : null}
          {thanks && execHash ? (
            <a
              href={explorerUrl(execHash)}
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
  );
}
