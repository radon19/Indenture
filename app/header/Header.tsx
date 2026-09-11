"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { IndentureLogo } from "./IndentureLogo";

const NAV = [
  { href: "/borrow", label: "Borrow", hot: true },
  { href: "/score", label: "Score", hot: true },
  { href: "/evidence", label: "Evidence", hot: false },
  { href: "/docs", label: "Docs", hot: false },
];

function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-paper">
      <div className="mx-auto flex h-16 max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <IndentureLogo size={40} className="rounded-lg shadow-md ring-1 ring-line" />
          <span className="text-[19px] font-semibold tracking-tight text-ink">
            Indenture
          </span>
        </Link>

        <nav className="flex items-center gap-1 text-[15px]" aria-label="Primary">
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

        <div className="ml-auto">
          <ConnectButton accountStatus="address" showBalance={false} />
        </div>
      </div>
    </header>
  );
}

export default Header;
