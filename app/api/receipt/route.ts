import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { creditCoin3Testnet } from "viem/chains";
import { db } from "@/app/lib/db";
import { creditScoreAbi } from "@/app/lib/abi";
import { ADDRESSES } from "@/app/lib/site";

// GET /api/receipt?user=0x… — takes a wallet, returns chain score + filed
// proofs in one call. Halves fail independently: DB down still returns score.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const user = (searchParams.get("user") ?? "").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(user)) {
    return NextResponse.json(
      { ok: false, error: "need ?user=0x… (40 hex characters)" },
      { status: 400 },
    );
  }

  // Chain score: independent of the DB so a store outage still returns it.
  let score: Record<string, string | number> | null = null;
  try {
    const rpc =
      process.env.CREDITCOIN_RPC_URL ??
      process.env.NEXT_PUBLIC_CREDITCOIN_RPC_URL;
    if (!rpc) throw new Error("no creditcoin RPC configured");
    const client = createPublicClient({
      chain: creditCoin3Testnet,
      transport: http(rpc),
    });
    const data = (await client.readContract({
      address: ADDRESSES.creditcoinTestnet.creditScore,
      abi: creditScoreAbi,
      functionName: "previewCredit",
      args: [user as `0x${string}`],
    })) as unknown as [
      number,
      bigint,
      bigint,
      bigint,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    const [
      scorePts,
      capacity18,
      maxRepayment18,
      oldestActivity,
      venues,
      venueCount,
      defaults,
      tier,
      collateralBps,
      collateralPercent,
      interestBps,
      interestPercent,
    ] = data;
    score = {
      score: Number(scorePts),
      capacity18: capacity18.toString(),
      maxRepayment18: maxRepayment18.toString(),
      oldestActivity: oldestActivity.toString(),
      venues: Number(venues),
      venueCount: Number(venueCount),
      defaults: Number(defaults),
      tier: Number(tier),
      collateralBps: Number(collateralBps),
      collateralPercent: Number(collateralPercent),
      interestBps: Number(interestBps),
      interestPercent: Number(interestPercent),
    };
  } catch {
    score = null;
  }

  // Filed proofs: case-insensitive borrower match.
  try {
    const [proofs, counter] = await Promise.all([
      db.evidence.findMany({
        where: { borrower: { equals: user, mode: "insensitive" } },
        orderBy: { id: "asc" },
      }),
      db.counter.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
    ]);
    return NextResponse.json({
      ok: true,
      user,
      score,
      totalFiled: proofs.length,
      totalProved: counter.totalProved,
      proofs: proofs.map((r) => ({
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
      offline: false,
    });
  } catch {
    return NextResponse.json({
      ok: true,
      user,
      score,
      totalFiled: 0,
      totalProved: 0,
      proofs: [],
      offline: true,
    });
  }
}
