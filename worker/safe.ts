import "dotenv/config";
import { ethers } from "ethers";
import { readFileSync, writeFileSync, existsSync } from "fs";

const SAFE_ABI = [
  "function nonce() view returns (uint256)",
  "function getTransactionHash(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 _nonce) view returns (bytes32)",
  "function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address payable refundReceiver,bytes signatures) returns (bool)",
];

const PENDING = "./.safe-pending.json";
const ZERO = "0x0000000000000000000000000000000000000000";

type Proposal = {
  id: string;
  to: string;
  value: string;
  data: string;
  operation: number;
  nonce: string;
  hash: string;
  signatures: { signer: string; sig: string }[];
};

function load(): Proposal[] {
  if (!existsSync(PENDING)) return [];
  return JSON.parse(readFileSync(PENDING, "utf8"));
}
function save(all: Proposal[]) {
  writeFileSync(PENDING, JSON.stringify(all, null, 1));
}
function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}
function safe(): ethers.Contract {
  const rpc = need("CREDITCOIN_RPC_URL");
  return new ethers.Contract(need("SAFE_ADDRESS"), SAFE_ABI, new ethers.JsonRpcProvider(rpc));
}

async function propose() {
  const [to, value, data] = [process.argv[3], process.argv[4] ?? "0", process.argv[5] ?? "0x"];
  if (!to || !ethers.isAddress(to)) throw new Error("usage: propose <to> [value] [data]");
  const c = safe();
  const nonce = await c.nonce();
  const hash: string = await c.getTransactionHash(to, value, data, 0, 0, 0, 0, ZERO, ZERO, nonce);
  const all = load();
  const id = String(all.length + 1);
  all.push({ id, to, value, data, operation: 0, nonce: nonce.toString(), hash, signatures: [] });
  save(all);
  console.log(`proposal ${id} (nonce ${nonce}): ${hash}`);
}

async function sign() {
  const [id, keyName] = [process.argv[3], process.argv[4] ?? "SIGNER_KEY"];
  const all = load();
  const p = all.find((x) => x.id === id);
  if (!p) throw new Error(`no proposal ${id}`);
  const key = need(keyName);
  const wallet = new ethers.Wallet(key);
  const flat = await wallet.signMessage(ethers.getBytes(p.hash));
  const sig = ethers.Signature.from(flat);
  // Safe wants eth_sign type: v 27/28 shifted to 31/32 so it hashes with the prefix.
  const adjusted = sig.r + sig.s.slice(2) + (Number(sig.v) + 4).toString(16).padStart(2, "0");
  if (p.signatures.some((s) => s.signer.toLowerCase() === wallet.address.toLowerCase())) {
    throw new Error("already signed by this key");
  }
  p.signatures.push({ signer: wallet.address, sig: adjusted });
  save(all);
  console.log(`signed proposal ${id} as ${wallet.address} (${p.signatures.length}/2+)`);
}

async function execute() {
  const [id, keyName] = [process.argv[3], process.argv[4] ?? "SIGNER_KEY"];
  const all = load();
  const p = all.find((x) => x.id === id);
  if (!p) throw new Error(`no proposal ${id}`);
  if (p.signatures.length < 2) throw new Error(`need 2 signatures, have ${p.signatures.length}`);
  const sorted = [...p.signatures].sort((a, b) =>
    a.signer.toLowerCase() < b.signer.toLowerCase() ? -1 : 1,
  );
  const cRead = safe();
  const liveNonce: bigint = await cRead.nonce();
  if (BigInt(p.nonce) !== liveNonce) {
    throw new Error(
      `stale proposal: signed for nonce ${p.nonce} but Safe is at ${liveNonce} — re-propose, re-sign, then execute`,
    );
  }
  const sigs = "0x" + sorted.map((s) => s.sig.slice(2)).join("");
  const key = need(keyName);
  const c = safe().connect(new ethers.Wallet(key, new ethers.JsonRpcProvider(need("CREDITCOIN_RPC_URL"))));
  const tx = await c.execTransaction(p.to, p.value, p.data, p.operation, 0, 0, 0, ZERO, ZERO, sigs);
  console.log("sent:", tx.hash);
  const rec = await tx.wait();
  console.log("status:", rec?.status === 1 ? "ok" : "REVERT");
}

async function list() {
  for (const p of load()) {
    console.log(`#${p.id} -> ${p.to} value=${p.value} nonce=${p.nonce} sigs=${p.signatures.length} hash=${p.hash}`);
  }
}

const cmd = process.argv[2];
if (cmd === "propose") await propose();
else if (cmd === "sign") await sign();
else if (cmd === "execute") await execute();
else if (cmd === "list") await list();
else {
  console.log("usage: bun safe.ts propose <to> [value] [data] | sign <id> [KEYENV] | execute <id> [KEYENV] | list");
  console.log("env: SAFE_ADDRESS, CREDITCOIN_RPC_URL, SIGNER_KEY (or named key per command)");
}
