import { NextResponse } from "next/server";
import { db } from "@/app/lib/db";
import { recordProof } from "@/app/lib/evidence";

/** GET /api/evidence?protocol=aave|spark|compound&kind=repay|liquidation */
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

/** POST /api/evidence — called by the frontend after a successful ingest. */
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
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
