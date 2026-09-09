"use client";

import { IndentureLogo } from "./IndentureLogo";
import Link from "next/link";

function Header() {
  return (
    <header className="border-b border-abyss-700 bg-abyss-950/80 backdrop-blur-xl sticky top-0 z-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <IndentureLogo className="h-8 w-8" />
        <div className="flex h-16 items-center justify-between">
          <div>
            <Link href="/evidence">Evidence</Link>
          </div>
          <div>
            <Link href="/docs">Docs</Link>
          </div>
        </div>

        <Link href="/play">Playground</Link>
      </div>
    </header>
  );
}

export default Header;
