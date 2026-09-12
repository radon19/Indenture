import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { creditCoin3Testnet } from "viem/chains";
import { db } from "@/app/lib/db";
import { recordProof } from "@/app/lib/evidence";

const SCORES = "0xFA19b4DDCEA765Ce8662ec9ea15438Adce44E237";

// In-memory per-IP throttle (20 req/min). Persistence would need the DB this guards.
const hits = new Map<string, number[]>();

function throttled(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 20;
}

// Takes an execute() hash, returns true if it's a real successful ingest of
// the score contract. Write-verified, not writer-authenticated: forging a row
// costs a real ingest — at which point it is true.
async function ingestConfirmed(execHash: string): Promise<boolean> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(execHash)) return false;
  const rpc = process.env.NEXT_PUBLIC_CREDITCOIN_RPC_URL;
  if (!rpc) return false;
  try {
    const client = createPublicClient({ chain: creditCoin3Testnet, transport: http(rpc) });
    const rec = await client.getTransactionReceipt({ hash: execHash as `0x${string}` });
    return rec.status === "success" && rec.to?.toLowerCase() === SCORES.toLowerCase();
  } catch {
    return false;
  }
}

// GET /api/evidence?protocol=&kind= — takes filters, returns rows + totals +
// breakdown. DB down returns the static floor (offline:true), never a 500.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const protocol = searchParams.get("protocol");
  const kind = searchParams.get("kind");

  const where: { protocol?: string; kind?: string } = {};
  if (protocol && protocol !== "all") where.protocol = protocol;
  if (kind && kind !== "all") where.kind = kind;

  try {
    const [rows, total, counter, breakdown] = await Promise.all([
      db.evidence.findMany({ where, orderBy: { id: "asc" }, take: 500 }),
      db.evidence.count({ where }),
      db.counter.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
      db.evidence.groupBy({ by: ["protocol", "kind"], _count: { _all: true } }),
    ]);

    return NextResponse.json({
      rows: rows.map((r) => ({
        txn: String(r.id).padStart(4, "0"),
        txHash: r.txHash,
        chainKey: r.chainKey,
        protocol: r.protocol,
        kind: r.kind,
        borrower: r.borrower,
        amountRaw: r.amountRaw,
        blockNumber: r.blockNumber?.toString() ?? null,
        status: "verified" as const,
      })),
      total,
      totalProved: counter.totalProved,
      breakdown: breakdown.map((b) => ({ protocol: b.protocol, kind: b.kind, count: b._count._all })),
    });
  } catch {
    // Store unreachable (local postgres down, Supabase not yet wired):
    // stay up with a static floor instead of 500ing the page.
    return NextResponse.json({
      rows: [],
      total: 0,
      totalProved: 70,
      breakdown: [],
      offline: true,
    });
  }
}

// POST /api/evidence — takes the proven-call fields + execHash, verifies the
// ingest on-chain, stores one deduped row. Any store failure is a 503.
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (throttled(ip)) {
    return NextResponse.json({ ok: false, error: "rate limited" }, { status: 429 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  const { txHash, chainKey, protocol, kind } = body ?? {};
  if (typeof txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return NextResponse.json({ ok: false, error: "bad txHash" }, { status: 400 });
  }
  if (chainKey !== 1 && chainKey !== 3) {
    return NextResponse.json({ ok: false, error: "bad chainKey" }, { status: 400 });
  }
  const blockNumber =
    typeof body.blockNumber === "number" && Number.isSafeInteger(body.blockNumber) ? body.blockNumber : null;
  if (typeof body.execHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(body.execHash)) {
    return NextResponse.json(
      { ok: false, error: "outdated app build — hard-refresh and retry" },
      { status: 400 },
    );
  }
  if (typeof body.execHash !== "string" || !(await ingestConfirmed(body.execHash))) {
    return NextResponse.json(
      { ok: false, error: "no confirmed on-chain ingest for this record" },
      { status: 422 },
    );
  }
  try {
    const result = await recordProof({
      txHash,
      chainKey,
      protocol: typeof protocol === "string" ? protocol : "unknown",
      kind: kind === "liquidation" ? "liquidation" : "repay",
      borrower: typeof body.borrower === "string" ? body.borrower : null,
      amountRaw: typeof body.amountRaw === "string" ? body.amountRaw : null,
      blockNumber,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: "evidence store unreachable" }, { status: 503 });
  }
}
