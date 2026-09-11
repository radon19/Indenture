import { NextResponse } from "next/server";

/** Same-origin gate: browser calls here, server calls the worker with the secret. */
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  const { chainKey, txHash } = body ?? {};
  if ((chainKey !== 1 && chainKey !== 3) || typeof txHash !== "string") {
    return NextResponse.json({ ok: false, error: "need {chainKey: 1|3, txHash}" }, { status: 400 });
  }

  const workerUrl = process.env.WORKER_URL ?? "http://localhost:3001";
  const token = process.env.WORKER_AUTH_TOKEN;
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "prover not configured — try again shortly" },
      { status: 503 },
    );
  }

  try {
    const res = await fetch(`${workerUrl}/prove`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ chainKey, txHash }),
    });
    const data = await res.json().catch(() => null);
    if (!data?.ok) {
      return NextResponse.json(
        { ok: false, error: data?.error ?? "prover failed" },
        { status: res.status === 429 ? 429 : 422 },
      );
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ ok: false, error: "can't reach the prover — is the worker running?" }, { status: 502 });
  }
}
