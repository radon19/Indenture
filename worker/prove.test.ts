import { describe, expect, test } from "bun:test";
import { cleanError, summarizeLogs } from "./prove";

const AAVE = "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2";
const SPARK = "0xC13e21B648A5Ee794902342038FF3aDAB66BE987";
const COMET = "0xc3d688B66703497DAA19211EEdff47f25384cdc3";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const USER = "0xe4fd8213711f18fad8a97a1db45436abd8a2902c";

const T = (a: string) => "0x" + "0".repeat(24) + a.slice(2).toLowerCase();
const JOIN = "0x";

describe("cleanError", () => {
  test("passes through short honest messages", () => {
    expect(cleanError(new Error("source tx not found"))).toContain("not found");
  });
  test("maps hash-shape failures", () => {
    const e = { message: 'invalid argument 0: hex string has length 12, want 64 for common.Hash", payload={}' };
    expect(cleanError(e)).toContain("64 hex characters");
  });
  test("maps throttling", () => {
    expect(cleanError(new Error("429 too many requests"))).toContain("retry in a minute");
  });
  test("truncates blobs to one line", () => {
    const big = "x".repeat(500) + "\nsecond line";
    const out = cleanError(new Error(big));
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out).not.toContain("\n");
  });
  test("never returns empty", () => {
    expect(cleanError("").length).toBeGreaterThan(0);
    expect(cleanError(null).length).toBeGreaterThan(0);
  });
  test("prefers shortMessage over blobs", () => {
    const e = { shortMessage: "rejected", message: "rejected: " + "y".repeat(400) };
    expect(cleanError(e)).toBe("rejected");
  });
});

describe("summarizeLogs", () => {
  const REPAY =
    "0xa534c8dbe71f871f9f3530e97a74601fea17b426cae02e1c5aee42c96c784051";
  const LIQ =
    "0xe413a321e8681d831f4dbccbca790d2952b56f977908e45be37335533e005286";
  const SUPPLY =
    "0xd1cf3d156d5f8f0d50f6c122ed609cec09d35c9b9fb3fff6ea0959134dae424e";

  test("aave repay names borrower + amount", () => {
    const s = summarizeLogs(
      [{ address: AAVE, topics: [REPAY, T(USDC), T(USER), T(USER)], data: "0x" + "0".repeat(57) + "4dfb8b3" + "0".repeat(63) + "0" }],
      COMET,
      COMET,
    );
    expect(s.protocol).toBe("aave");
    expect(s.kind).toBe("repay");
    expect(s.borrower?.toLowerCase()).toBe(USER.toLowerCase());
    expect(s.amountRaw).toBe("81770675");
  });

  test("spark shares the signature but keeps its name", () => {
    const s = summarizeLogs(
      [{ address: SPARK, topics: [REPAY, T(USDC), T(USER), T(USER)], data: "0x" + "0".repeat(57) + "4dfb8b3" + "0".repeat(63) + "0" }],
      COMET,
      COMET,
    );
    expect(s.protocol).toBe("spark");
  });

  test("same shape from a stranger emitter is unknown", () => {
    const s = summarizeLogs(
      [{ address: "0x000000000000000000000000000000000000dEaD", topics: [REPAY, T(USDC), T(USER), T(USER)], data: "0x" + "0".repeat(56) + "01" + "0".repeat(63) + "0" }],
      COMET,
      COMET,
    );
    expect(s.protocol).toBe("unknown");
  });

  test("aave liquidation reads user + cover", () => {
    const s = summarizeLogs(
      [{ address: AAVE, topics: [LIQ, T(USDC), T(USDC), T(USER)], data: "0x" + "0".repeat(62) + "0a" + "0".repeat(62) + "0b" }],
      COMET,
      COMET,
    );
    expect(s.kind).toBe("liquidation");
    expect(s.borrower?.toLowerCase()).toBe(USER.toLowerCase());
    expect(s.amountRaw).toBe("10");
  });

  test("compound supply resolves via emitter", () => {
    const s = summarizeLogs(
      [{ address: COMET, topics: [SUPPLY, T(USER), T(USER)], data: "0x" + "0".repeat(56) + "3b9aca00" }],
      COMET,
      "0x000000000000000000000000000000000000dEaD",
    );
    expect(s.protocol).toBe("compound");
    expect(s.amountRaw).toBe("1000000000");
  });

  test("empty + garbage logs stay unknown, never throw", () => {
    expect(summarizeLogs([], COMET, COMET).protocol).toBe("unknown");
    expect(
      summarizeLogs([{ address: AAVE, topics: ["0xdead"], data: "0x" }], COMET, COMET).kind,
    ).toBe("unknown");
  });
});
