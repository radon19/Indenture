import { db } from "./db";

export type EvidenceInput = {
  txHash: string;
  chainKey: number;
  protocol: string;
  kind: string;
  borrower: string | null;
  amountRaw: string | null;
  blockNumber: number | null;
};

/**
 * Stores one proven-and-ingested call. txHash dedupes: re-recording updates
 * the row and never double-counts. Returns the global total.
 */
export async function recordProof(input: EvidenceInput): Promise<{ totalProved: number; fresh: boolean }> {
  const txHash = input.txHash.toLowerCase();
  const data = {
    chainKey: input.chainKey,
    protocol: input.protocol,
    kind: input.kind,
    borrower: input.borrower,
    amountRaw: input.amountRaw,
    blockNumber: input.blockNumber,
  };
  try {
    await db.evidence.create({ data: { txHash, ...data } });
    const counter = await db.counter.upsert({
      where: { id: 1 },
      update: { totalProved: { increment: 1 } },
      create: { id: 1, totalProved: 1 },
    });
    return { totalProved: counter.totalProved, fresh: true };
  } catch (e) {
    // ponytail: create-first, not find-first — the unique constraint is the
    // atomic dedupe. Must stay outside $transaction: postgres aborts the
    // whole tx on P2002 (25P02), so catch-and-update inside one tx can't work.
    if ((e as { code?: string }).code !== "P2002") throw e;
    await db.evidence.update({ where: { txHash }, data });
    const counter = await db.counter.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
    return { totalProved: counter.totalProved, fresh: false };
  }
}
