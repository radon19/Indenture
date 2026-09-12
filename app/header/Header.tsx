"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { IndentureLogo } from "./IndentureLogo";

const NAV = [
  { href: "/borrow", label: "Borrow", hot: true },
  { href: "/score", label: "Score", hot: true },
  { href: "/evidence", label: "Evidence", hot: false },
  { href: "/docs", label: "Docs", hot: false },
  { href: "/security", label: "Security", hot: false },
];

function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-paper">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-x-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <IndentureLogo size={40} className="rounded-lg shadow-md ring-1 ring-line" />
          <span className="text-[19px] font-semibold tracking-tight text-ink">
            Indenture
          </span>
        </Link>

        <nav className="hidden items-center gap-1 text-[15px] md:flex" aria-label="Primary">
          {NAV.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 transition-colors ${
                  item.hot
                    ? active
                      ? "bg-gold font-semibold text-ink"
                      : "bg-gold/15 font-semibold text-gold-deep hover:bg-gold/25 hover:text-ink"
                    : active
                      ? "bg-ink text-paper"
                      : "text-muted hover:bg-parchment hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ConnectButton accountStatus="address" showBalance={false} />
          <button
            type="button"
            className="rounded-md border border-line p-2.5 text-ink md:hidden"
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              {open ? (
                <>
                  <line x1="4" y1="4" x2="14" y2="14" />
                  <line x1="14" y1="4" x2="4" y2="14" />
                </>
              ) : (
                <>
                  <line x1="3" y1="5" x2="15" y2="5" />
                  <line x1="3" y1="9" x2="15" y2="9" />
                  <line x1="3" y1="13" x2="15" y2="13" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {open ? (
        <nav className="border-t border-line bg-paper px-4 py-2 md:hidden" aria-label="Mobile">
          {NAV.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`block rounded-md px-3 py-2.5 text-[15px] ${
                  item.hot
                    ? active
                      ? "bg-gold font-semibold text-ink"
                      : "font-semibold text-gold-deep"
                    : active
                      ? "bg-ink text-paper"
                      : "text-muted"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </header>
  );
}

export default Header;
