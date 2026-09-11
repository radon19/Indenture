"use client";

import type { ReactNode } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { creditCoin3Testnet } from "wagmi/chains";
import { Card, SectionHeading, Btn } from "./ui";

/**
 * Renders children only on Creditcoin. On any other connected chain,
 * hides the page behind a switch box instead.
 */
export default function NetworkGate({ children }: { children: ReactNode }) {
  const { chainId, isConnected } = useAccount();
  const { switchChain, isPending, error } = useSwitchChain();

  if (!isConnected || chainId === creditCoin3Testnet.id) return <>{children}</>;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <SectionHeading
        kicker="Wrong network"
        title="This page lives on Creditcoin."
        lede="Your wallet is connected elsewhere. Switch networks to continue — nothing here reads or writes until you do."
      />
      <Card className="mt-8 max-w-md p-6">
        <p className="font-mono text-[13px] text-muted">
          Required: Creditcoin Testnet (chain {creditCoin3Testnet.id})
        </p>
        {error ? (
          <p className="mt-2 text-[13px] font-medium text-bronze">
            Switch failed: {error.message.split("\n")[0]}
          </p>
        ) : null}
        <div className="mt-4">
          <Btn
            disabled={isPending}
            onClick={() => switchChain({ chainId: creditCoin3Testnet.id })}
          >
            {isPending ? "Switching…" : "Switch to Creditcoin"}
          </Btn>
        </div>
      </Card>
    </div>
  );
}
