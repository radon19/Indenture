"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { IndentureLogo } from "./IndentureLogo";

function Header() {
  return (
    <header className="border-b border-abyss-700 bg-abyss-950/80 backdrop-blur-xl sticky top-0 z-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
<IndentureLogo className="h-8 w-8"/>
          <div className="flex items-center gap-3">
            <ConnectButton />
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;
