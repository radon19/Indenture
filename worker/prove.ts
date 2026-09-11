import "dotenv/config";
import { ethers } from "ethers";
import { proofProvider } from "@gluwa/usc-sdk";

export type ExecuteArgs = {
  action: number;
  chainKey: number;
  blockHeight: number;
  encodedTransaction: string;
  merkleRoot: string;
  siblings: { hash: string; isLeft: boolean }[];
  lowerEndpointDigest: string;
  continuityRoots: string[];
};

export type ProofSummary = {
  protocol: "aave" | "spark" | "compound" | "facility" | "unknown";
  kind: "repay" | "liquidation" | "unknown";
  borrower: string | null;
  amountRaw: string | null;
};

function pick(obj: any, keys: string[]) {
  for (const k of keys) if (obj?.[k] != null) return obj[k];
  return undefined;
}

export function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name} (see .env.example)`);
  return v;
}

/** Short human message out of ethers/RPC blobs. Never leaks payload JSON. */
export function cleanError(e: unknown): string {
  const anyE = e as any;
  const raw =
    typeof anyE?.shortMessage === "string"
      ? anyE.shortMessage
      : typeof anyE?.reason === "string"
        ? anyE.reason
        : e instanceof Error
          ? e.message
          : String(e);
  const first = raw.split("\n")[0].replace(/\s+/g, " ").trim();
  if (/invalid argument|invalid.*hash|hex string/i.test(first)) {
    return "that doesn't look like a transaction hash (0x followed by 64 hex characters)";
  }
  if (/not found|reorg/i.test(first)) return "source transaction not found — wrong hash or chain?";
  if (/rate|limit|429|throttl/i.test(first)) return "source RPC is throttling — retry in a minute";
  if (first.length > 160) return "something went wrong checking this transaction";
  return first || "something went wrong checking this transaction";
}

export function rpcFor(chainKey: number): string | undefined {
  return (
    process.env[`SOURCE_RPC_URL_${chainKey}`] ??
    process.env.SOURCE_RPC_URL ??
    undefined
  );
}

function normSibling(e: any, i: number) {
  const hash = pick(e, ["hash", "sibling", "node"]);
  let isLeft = pick(e, ["isLeft", "isLeftSide", "left"]);
  if (typeof isLeft === "number") isLeft = isLeft !== 0;
  if (typeof hash !== "string" || typeof isLeft !== "boolean") {
    throw new Error(`sibling ${i} has unknown shape`);
  }
  return { hash, isLeft };
}

const SIGS = {
  aaveRepay: ethers.id("Repay(address,address,address,uint256,bool)"),
  aaveLiq: ethers.id("LiquidationCall(address,address,address,uint256,uint256,address,bool)"),
  compoundSupply: ethers.id("Supply(address,address,uint256)"),
  compoundAbsorb: ethers.id("AbsorbCollateral(address,address,address,uint256,uint256)"),
  facilityRepay: ethers.id("LoanRepaid(uint256,address,uint256,uint256)"),
  facilityDefault: ethers.id("LoanDefaulted(uint256,address,uint256)"),
};

const addr = (t: string) => ethers.getAddress("0x" + t.slice(-40));

const AAVE_V3_POOL = "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2";
const SPARK_POOL = "0xC13e21B648A5Ee794902342038FF3aDAB66BE987";

/** Same events as Aave by design (Spark is a fork) — emitter tells them apart. */
function aaveLikeProtocol(emitter: string): "aave" | "spark" | "unknown" {
  const lc = emitter.toLowerCase();
  if (lc === AAVE_V3_POOL.toLowerCase()) return "aave";
  if (lc === SPARK_POOL.toLowerCase()) return "spark";
  return "unknown";
}

/** Best-effort read of what a receipt proves. Contract remains the judge. */
export function summarizeLogs(
  logs: { address: string; topics: string[]; data: string }[],
  cometUSDC: string,
  cometUSDT: string,
): ProofSummary {
  const unknown: ProofSummary = { protocol: "unknown", kind: "unknown", borrower: null, amountRaw: null };
  for (const log of logs) {
    const sig = log.topics[0]?.toLowerCase();
    const coder = ethers.AbiCoder.defaultAbiCoder();
    try {
      if (sig === SIGS.aaveRepay.toLowerCase() || sig === SIGS.aaveLiq.toLowerCase()) {
        const protocol = aaveLikeProtocol(log.address);
        if (protocol === "unknown") continue;
        if (sig === SIGS.aaveRepay.toLowerCase()) {
          const [amount] = coder.decode(["uint256", "bool"], log.data) as unknown as [bigint, boolean];
          return { protocol, kind: "repay", borrower: addr(log.topics[2]), amountRaw: amount.toString() };
        }
        const [cover] = coder.decode(["uint256", "uint256"], log.data) as unknown as [bigint, bigint];
        return { protocol, kind: "liquidation", borrower: addr(log.topics[3]), amountRaw: cover.toString() };
      }
      if (sig === SIGS.compoundSupply.toLowerCase()) {
        const [amount] = coder.decode(["uint256"], log.data) as unknown as [bigint];
        const lc = log.address.toLowerCase();
        const protocol = lc === cometUSDC.toLowerCase() || lc === cometUSDT.toLowerCase() ? "compound" : "unknown";
        if (protocol === "unknown") continue;
        return { protocol, kind: "repay", borrower: addr(log.topics[2]), amountRaw: amount.toString() };
      }
      if (sig === SIGS.compoundAbsorb.toLowerCase()) {
        const [absorbed] = coder.decode(["uint256", "uint256"], log.data) as unknown as [bigint, bigint];
        return { protocol: "compound", kind: "liquidation", borrower: addr(log.topics[2]), amountRaw: absorbed.toString() };
      }
      if (sig === SIGS.facilityRepay.toLowerCase()) {
        const [amount] = coder.decode(["uint256", "uint256"], log.data) as unknown as [bigint, bigint];
        return { protocol: "facility", kind: "repay", borrower: addr(log.topics[2]), amountRaw: amount.toString() };
      }
      if (sig === SIGS.facilityDefault.toLowerCase()) {
        const [remaining] = coder.decode(["uint256"], log.data) as unknown as [bigint];
        return { protocol: "facility", kind: "liquidation", borrower: addr(log.topics[2]), amountRaw: remaining.toString() };
      }
    } catch {
      continue;
    }
  }
  return unknown;
}

export async function fetchReceipt(txHash: string, chainKey: number) {
  const rpc = rpcFor(chainKey);
  if (!rpc) throw new Error(`no RPC for chain ${chainKey} (set SOURCE_RPC_URL_${chainKey})`);
  const provider = new ethers.JsonRpcProvider(rpc);
  const rec = await provider.getTransactionReceipt(txHash);
  if (!rec) throw new Error("source tx not found (reorg or wrong hash?)");
  if (rec.status !== 1) throw new Error(`source tx reverted (status ${rec.status}) — nothing to prove`);
  return rec;
}

/** Full attestation → execute-ready args. Holds no keys. */
export async function proveTx(txHash: string, chainKey: number): Promise<ExecuteArgs> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) throw new Error("bad tx hash shape");
  if (chainKey !== 1 && chainKey !== 3) throw new Error("chainKey must be 1 or 3");

  const builder = new proofProvider.service.ProofBuilder(chainKey, need("CREDITCOIN_PROOF_BUILDER_URL"));
  const result = await builder.getProof(txHash);
  if (!result.success || !result.data) {
    throw new Error(String((result as any).error ?? "proof failed"));
  }

  const p: any = result.data;
  const merkle = p.merkleProof ?? {};
  const cont = p.continuityProof ?? {};
  const rawSiblings = (pick(merkle, ["siblings", "proof"]) ?? []) as unknown[];

  const args: ExecuteArgs = {
    action: 0,
    chainKey: pick(p, ["chainKey"]) as number,
    blockHeight: pick(p, ["headerNumber", "blockHeight", "height"]) as number,
    encodedTransaction: pick(p, ["txBytes", "encodedTransaction"]) as string,
    merkleRoot: pick(merkle, ["root", "merkleRoot"]) as string,
    siblings: rawSiblings.map(normSibling),
    lowerEndpointDigest: pick(cont, ["lowerEndpointDigest", "lowerDigest"]) as string,
    continuityRoots: (pick(cont, ["roots", "continuityRoots"]) ?? []) as string[],
  };
  for (const [k, v] of Object.entries(args)) {
    if (v === undefined || v === null) throw new Error(`proof missing field for ${k}`);
  }
  return args;
}
