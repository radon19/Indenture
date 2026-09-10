import "dotenv/config";
import { ethers } from "ethers";
import { fetchReceipt, need, proveTx, summarizeLogs, cleanError } from "./prove";

const ABI = [
  "function execute(uint8 action,uint64 chainKey,uint64 blockHeight,bytes encodedTransaction,bytes32 merkleRoot,tuple(bytes32 hash,bool isLeft)[] siblings,bytes32 lowerEndpointDigest,bytes32[] continuityRoots) returns (bool)",
  "function getScore(address user) view returns (uint16)",
];

const COMET_USDC = "0xc3d688B66703497DAA19211EEdff47f25384cdc3";
const COMET_USDT = "0x3Afdc9BCA9213A35503b077a6072F3D0d5AB0840";

async function main() {
  const txHash = process.argv[2];
  const checkAddr = process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : undefined;
  const dry = process.argv.includes("--dry");
  const json = process.argv.includes("--json");

  if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    console.error("usage: bun worker.ts <txHash> [borrower] [--chain 1|3] [--dry] [--json]");
    process.exit(1);
  }
  if (checkAddr && !ethers.isAddress(checkAddr)) {
    console.error(`bad borrower address: ${checkAddr}`);
    process.exit(1);
  }

  const chainFlag = process.argv.indexOf("--chain");
  const chainKey =
    chainFlag >= 0 ? Number(process.argv[chainFlag + 1]) : Number(process.env.SOURCE_CHAIN_KEY ?? 3);
  if (chainKey !== 1 && chainKey !== 3) {
    console.error("--chain must be 1 (Sepolia) or 3 (mainnet)");
    process.exit(1);
  }

  const rec = await fetchReceipt(txHash, chainKey).catch((e) => {
    console.log(`receipt pre-check skipped/failed: ${(e as Error).message}`);
    return null;
  });
  if (rec) {
    const s = summarizeLogs(
      rec.logs.map((l) => ({ address: l.address, topics: [...l.topics], data: l.data })),
      COMET_USDC,
      COMET_USDT,
    );
    console.log("receipt:", { logs: rec.logs.length, ...s });
  }

  console.log("building proof (wait if height not attested yet)…");
  const args = await proveTx(txHash, chainKey);

  const summary = {
    txHash,
    chainKey: args.chainKey,
    blockHeight: args.blockHeight,
    merkleRoot: args.merkleRoot,
    siblings: args.siblings.length,
    continuityRoots: args.continuityRoots.length,
    txBytes: args.encodedTransaction.length,
  };
  console.log(json ? JSON.stringify(summary) : summary);

  if (dry) {
    console.log("dry run — not sending");
    return;
  }

  const wallet = new ethers.Wallet(
    need("CREDITCOIN_PRIVATE_KEY"),
    new ethers.JsonRpcProvider(need("CREDITCOIN_RPC_URL")),
  );
  const c = new ethers.Contract(need("SCORE_CONTRACT"), ABI, wallet);

  let tx;
  try {
    tx = await c.execute(
      args.action,
      args.chainKey,
      args.blockHeight,
      args.encodedTransaction,
      args.merkleRoot,
      args.siblings,
      args.lowerEndpointDigest,
      args.continuityRoots,
    );
  } catch (e: any) {
    const msg = String(e?.reason ?? e?.shortMessage ?? e?.message ?? e);
    if (/already processed/i.test(msg)) {
      console.log("already recorded — treating as success (someone beat us to it)");
      if (checkAddr) console.log("getScore", checkAddr, Number(await c.getScore(checkAddr)));
      return;
    }
    throw e;
  }
  console.log("execute:", tx.hash);
  const receipt = await tx.wait();
  console.log("status:", receipt?.status === 1 ? "ok" : "REVERT — inspect receipt");

  if (checkAddr) {
    console.log("getScore", checkAddr, Number(await c.getScore(checkAddr)));
  }
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(cleanError(e));
    process.exit(1);
  });
}
