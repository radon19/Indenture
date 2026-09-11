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
  const existing = await db.evidence.findUnique({ where: { txHash: input.txHash.toLowerCase() } });
  const data = {
    chainKey: input.chainKey,
    protocol: input.protocol,
    kind: input.kind,
    borrower: input.borrower,
    amountRaw: input.amountRaw,
    blockNumber: input.blockNumber,
  };
  if (existing) {
    await db.evidence.update({ where: { txHash: input.txHash.toLowerCase() }, data });
  } else {
    await db.evidence.create({ data: { txHash: input.txHash.toLowerCase(), ...data } });
  }
  const counter = existing
    ? await db.counter.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } })
    : await db.counter.upsert({
        where: { id: 1 },
        update: { totalProved: { increment: 1 } },
        create: { id: 1, totalProved: 1 },
      });
  return { totalProved: counter.totalProved, fresh: !existing };
}
