import "dotenv/config";
import { cleanError, fetchReceipt, proveTx, summarizeLogs } from "./prove";
import { timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.PORT ?? process.env.WORKER_PORT ?? 3001);
const COMET_USDC = "0xc3d688B66703497DAA19211EEdff47f25384cdc3";
const COMET_USDT = "0x3Afdc9BCA9213A35503b077a6072F3D0d5AB0840";

// In-memory per-IP throttle. No DB by design.
const hits = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_HITS = 10;

function throttled(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > MAX_HITS;
}

const cors = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function fail(status: number, error: string) {
  return new Response(JSON.stringify({ ok: false as const, error }), { status, headers: cors });
}

/** Shared-secret gate. Browser never holds this — only our Next.js server does. */
function authorized(req: Request): boolean {
  const expected = process.env.WORKER_AUTH_TOKEN;
  if (!expected) {
    console.warn("WORKER_AUTH_TOKEN unset — accepting unauthenticated calls (dev only)");
    return true;
  }
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method === "GET" && url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true as const }), { headers: cors });
    }
    if (req.method !== "POST" || url.pathname !== "/prove") {
      return fail(404, "use POST /prove {chainKey, txHash}");
    }
    const ip = req.headers.get("x-forwarded-for") ?? "local";
    if (throttled(ip)) return fail(429, "rate limited — retry in a minute");
    if (!authorized(req)) return fail(401, "unauthorized worker call");

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return fail(400, "invalid JSON");
    }
    const { chainKey, txHash } = body ?? {};
    if (chainKey !== 1 && chainKey !== 3) {
      return fail(400, "pick a source chain first");
    }
    if (typeof txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(txHash.trim())) {
      return fail(400, "that doesn't look like a transaction hash (0x followed by 64 hex characters)");
    }

    try {
      const rec = await fetchReceipt(txHash, chainKey);
      const summary = summarizeLogs(
        rec.logs.map((l) => ({ address: l.address, topics: [...l.topics], data: l.data })),
        COMET_USDC,
        COMET_USDT,
      );
      const args = await proveTx(txHash, chainKey);
      return new Response(
        JSON.stringify({
          ok: true as const,
          checkedAt: Date.now(),
          summary: { txHash, blockNumber: rec.blockNumber, ...summary },
          execute: args,
        }),
        { headers: cors },
      );
    } catch (e) {
      return fail(422, cleanError(e));
    }
  },
});

console.log(`worker api on :${PORT} — proving only, holds no keys`);
