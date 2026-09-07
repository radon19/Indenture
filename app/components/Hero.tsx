"use client";
import Link from "next/link";
import { useConnection } from "wagmi";

function Hero() {
  const {
    address,
    isConnected,
    isConnecting,
    isDisconnected,
    status,
    chainId,
  } = useConnection();

  return (
    <div>
      Credit that understands your on-chain behavior. Lock collateral. Get a
      credit line. Prove your financial activity across chains—and let your
      credit terms adapt automatically.
      {isConnected ? address : (isConnecting ? "Connecting..." : "" )}
      {isConnected ? <Link href="/dashboard">Dashboard</Link> : null}
      
    </div>
  );
}

export default Hero;
