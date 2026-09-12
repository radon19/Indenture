import Link from "next/link";
import { IndentureLogo } from "../header/IndentureLogo";

export default function Footer() {
  return (
    <footer className="border-t border-line-dark bg-ink text-paper print:hidden">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-4 px-4 py-8 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <IndentureLogo size={26} className="rounded-md" />
          <span className="text-[15px] font-semibold tracking-tight">Indenture</span>
        </Link>
        <p className="max-w-md text-[13px] leading-relaxed text-paper/60">
          One Credit Score. Every Chain. Scored from verified repayment history
          on Aave, Spark, and Compound — settled on Creditcoin.
        </p>
        <nav className="ml-auto flex gap-5 text-[13px] text-paper/70" aria-label="Footer">
          <Link className="hover:text-paper" href="/borrow">Borrow</Link>
          <Link className="hover:text-paper" href="/score">Score</Link>
          <Link className="hover:text-paper" href="/evidence">Evidence</Link>
          <Link className="hover:text-paper" href="/docs">Docs</Link>
        </nav>
      </div>
    </footer>
  );
}
