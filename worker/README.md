# Indenture worker — prove one source tx, optionally ingest it

```bash
cd worker && bun install
cp .env.example .env   # fill values
```

```bash
bun worker.ts <txHash> [borrower] [--chain 1|3] [--dry] [--json]
bun api.ts             # :3001 — proving API for the frontend
```

- Pre-checks the source receipt (status, existence) when a source RPC is set.
- Builds the attestation via `@gluwa/usc-sdk` `ProofBuilder` (waits for attestation).
- `--dry` prints the payload summary and stops. `--json` prints it machine-readable.
- Sends `execute()` from `CREDITCOIN_PRIVATE_KEY`; `already processed` is treated
  as success (permissionless ingestion means someone may beat you to it).
- Optional `[borrower]` prints `getScore` after ingest.

## API (what the frontend calls)

- `GET /health` → `{ok: true}`
- `POST /prove {chainKey: 1|3, txHash}` → `{ok, summary, execute, evidence}` or
  `{ok: false, error}` (400 validation, 422 prove/receipt failure, 429 throttled).
- `summary` names protocol/kind/borrower/amount best-effort; the contract
  remains the judge. Frontend signs `execute` itself from the response.
- In-memory per-IP throttle (10/min). Set `WORKER_PORT` and
  `NEXT_PUBLIC_WORKER_URL` (frontend) to deploy anywhere.

Storage lives in Next.js, not here: after a successful ingest the frontend
POSTs to `/api/evidence`, which dedupes by tx hash and bumps the global
total. This worker proves and returns — nothing else.

Holds keys only if you send. For proof-building alone (`--dry`, or the API),
no key needed — but `.env` still requires the builder URL.
