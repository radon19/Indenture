"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, SectionHeading, Skeleton, Stat, TierBadge } from "./ui";
import HeroArt from "./HeroArt";
import { TIERS, type TierName } from "../lib/site";

const TIER_CARD: Record<TierName, { bg: string; line: string; apr: string }> = {
  Bronze: { bg: "bg-[#26211b]", line: "border-[#9a6b3f]", apr: "text-[#c99a5e]" },
  Silver: { bg: "bg-[#22262c]", line: "border-[#7e8894]", apr: "text-[#a7b0bc]" },
  Gold: { bg: "bg-[#2a2417]", line: "border-[#b3872a]", apr: "text-[#d9a93b]" },
  Platinum: { bg: "bg-[#1c2723]", line: "border-[#465e54]", apr: "text-[#7fa08f]" },
};

function GitHubMark({ className = "h-4.5 w-4.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

function Hero() {
  const [totalProved, setTotalProved] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/evidence")
      .then((r) => r.json())
      .then((b) => {
        if (typeof b?.totalProved === "number") setTotalProved(b.totalProved);
      })
      .catch(() => {});
  }, []);
  return (
    <div>
      {/* HERO */}
      <section className="border-b border-line">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-16 sm:px-6 sm:pt-24 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
          <p className="font-mono text-[13px] uppercase tracking-[0.2em] text-gold-deep">
            On-chain credit, verified cross-chain
          </p>
          <h1 className="mt-4 font-display text-5xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-7xl sm:leading-[1.02]">
            One Credit Score.
            <br />
            Every Chain.
          </h1>
          <p className="mt-5 max-w-xl text-[19px] leading-relaxed text-muted">
            Prove repayment once. Borrow everywhere. Your Aave, Spark, and
            Compound history — one score you can use everywhere.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/score"
              className="rounded-lg bg-ink px-5 py-2.5 text-[15px] font-semibold text-paper hover:bg-ink-soft"
            >
              Check your score
            </Link>
            <Link
              href="/borrow"
              className="rounded-lg border border-line bg-card px-5 py-2.5 text-[15px] font-semibold text-ink hover:bg-parchment"
            >
              Borrow now
            </Link>
            <a
              href="https://github.com/radon19/Indenture"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-card px-5 py-2.5 text-[15px] font-semibold text-ink hover:bg-parchment"
            >
              <GitHubMark />
              Check source
            </a>
          </div>
          <dl className="mt-12 grid max-w-3xl grid-cols-2 gap-6 sm:grid-cols-4">
            <Stat label="Score range" value="400–900" sub="600 default" />
            <Stat label="Top tier" value="85%" sub="collateral at Platinum" />
            <Stat
              label="Payments proved"
              value={
                totalProved == null ? (
                  <Skeleton className="h-8 w-20 align-middle" />
                ) : (
                  String(totalProved)
                )
              }
              sub="and counting"
            />
            <Stat label="Test checks" value="112" sub="all green" />
          </dl>
          </div>
          <div className="mx-auto w-full max-w-110">
            <HeroArt className="h-auto w-full drop-shadow-xl" />
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <SectionHeading
            kicker="How it works"
            title="Repay there. Borrow here."
            lede="Three verified steps. No forms, no officers, no black box."
          />
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              {
                n: "01",
                title: "Prove",
                body: "Point at a real mainnet repayment — Aave, Spark, or Compound. Anyone can submit it, for anyone.",
              },
              {
                n: "02",
                title: "Score",
                body: "The registry verifies the receipt and updates your score, tier, and capacity.",
              },
              {
                n: "03",
                title: "Borrow",
                body: "Lock CTC, draw mockUSDC at tier-priced terms. Platinum posts 85% collateral for the full loan.",
              },
            ].map((s) => (
              <Card key={s.n} className="p-6">
                <p className="font-mono text-[13px] text-gold-deep">{s.n}</p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-muted">{s.body}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* TIERS */}
      <section className="border-b border-line-dark bg-ink text-paper">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <SectionHeading
            dark
            kicker="Terms"
            title="Better history, better rates."
            lede="Collateral and APR, frozen the day you borrow."
          />
          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {TIERS.map((t) => {
              const s = TIER_CARD[t.name];
              return (
              <div key={t.name} className={`border border-line-dark border-t-4 ${s.bg} ${s.line} p-6`}>
                <TierBadge tier={t.name} size="sm" />
                <p className="tabular mt-4 font-mono text-sm text-paper/60">{t.score}</p>
                <p className="tabular mt-1 font-mono text-2xl font-semibold text-paper">
                  {t.collateral} <span className="text-sm font-normal text-paper/50">collateral</span>
                </p>
                <p className={`tabular font-mono text-lg ${s.apr}`}>{t.apr} APR</p>
                <p className="mt-3 text-[13px] leading-relaxed text-paper/60">{t.blurb}</p>
              </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* TRUST */}
      <section>
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <SectionHeading
            kicker="Why trust it"
            title="Every claim has a test that fails if you break it."
            lede="112 checks green. Real mainnet receipts. A threat model that names what is still unsolved."
          />
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <Card className="p-6">
              <p className="font-mono text-[12px] uppercase tracking-[0.18em] text-gold-deep">
                Owned by a vault, not a laptop
              </p>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">
                Prices, sources, and pauses answer to a 2-of-3 multisig. One
                stolen key buys an attacker nothing.
              </p>
            </Card>
            <Card className="p-6">
              <p className="font-mono text-[12px] uppercase tracking-[0.18em] text-gold-deep">
                Reports welcome from anyone
              </p>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">
                Hidden liquidations get filed by whoever finds them — the record
                gets truer the more eyes watch it.
              </p>
            </Card>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/evidence"
              className="rounded-lg bg-gold px-5 py-2.5 text-[15px] font-semibold text-ink hover:bg-gold-deep hover:text-paper"
            >
              Browse the evidence
            </Link>
            <Link
              href="/docs"
              className="rounded-lg border border-line bg-card px-5 py-2.5 text-[15px] font-semibold text-ink hover:bg-parchment"
            >
              Read the credit-source docs
            </Link>
            <Link
              href="/security"
              className="rounded-lg border border-line bg-card px-5 py-2.5 text-[15px] font-semibold text-ink hover:bg-parchment"
            >
              Security model
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Hero;
