
// Retrieval hooks: address in, live chain/API views out.

import { useEffect, useState } from "react";
import { ADDRESSES, type TierName } from "./site";
import { useReadContract } from "wagmi";
import { creditCoin3Testnet } from "wagmi/chains";
import { creditScoreAbi, loanPoolAbi } from "./abi";
import { formatEther, formatUnits, getAddress, parseEther, parseUnits } from "viem";

const tierNames: Record<number, TierName> = {
  0: "Bronze",
  1: "Silver",
  2: "Gold",
  3: "Platinum",
};

export type CreditView = {
  score: number | null
  tier: TierName | null
  capacity: string | null
  maxRepayment: string | null
  venues: number | null
  defaults: number | null
  oldestActivity: string | null
}

const EMPTY_CREDIT: CreditView = {
  score: null,
  tier: null,
  capacity: null,
  maxRepayment: null,
  venues: null,
  defaults: null,
  oldestActivity: null,
}



// Takes a wallet address, reads previewCredit, returns the score view.
// Bad/empty address returns nulls without calling the chain.
export function useCreditScore(_address?: string): {
  data: CreditView
  isLoading: boolean
} {
  let address: `0x${string}` | undefined;
  try {
    address = _address && /^0x[0-9a-fA-F]{40}$/.test(_address.trim()) ? getAddress(_address.trim()) : undefined;
  } catch {
    address = undefined;
  }

  const { data, isLoading, error } = useReadContract({
    address: ADDRESSES.creditcoinTestnet.creditScore,
    abi: creditScoreAbi,
    functionName: 'previewCredit',
    chainId: creditCoin3Testnet.id,
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  })

  if (!address || error || !data) {
    return {
      data: EMPTY_CREDIT,
      isLoading: address ? isLoading : false,
    }
  }

  const [
  score,
  capacity18,
  maxRepayment18,
  oldestActivity,
  venues,
  venueCount,
  defaults,
  tier,
] = data

void venueCount;

return {
  data: {
    score: Number(score),
    tier: tierNames[Number(tier)] ?? null,
    capacity: capacity18.toString(),
    maxRepayment: maxRepayment18.toString(),
    venues: Number(venues),
    defaults: Number(defaults),
    oldestActivity: oldestActivity.toString(),
  },
  isLoading,
}
}

export type Quote = {
  collateralBps: number | null;
  interestBps: number | null;
  requiredCollateral: string | null;
  requiredCtC: number | null;
  requiredOk: boolean;
  maxBorrow: string | null;
  ready: boolean;
};

// Takes the debt textbox, returns mUSDC wei (6 decimals) or null if invalid.
function tryParseDebt(debt: string): bigint | null {
  try {
    if (!debt.trim()) return null;
    return parseUnits(debt.trim(), 6);
  } catch {
    return null;
  }
}

// Takes the lock textbox, returns CTC wei (18 decimals) or null if invalid.
function tryParseLocked(locked: string): bigint | null {
  try {
    if (!locked.trim()) return null;
    return parseEther(locked.trim());
  } catch {
    return null;
  }
}

// Takes user + debt/lock text, reads pool quotes, returns collateral need,
// max borrow, and whether the lock covers it. Not ready until debt parses.
export function useBorrowQuote(
  userAddress: string | undefined,
  debt: string,
  locked: string,
): Quote {
  const user = userAddress ? getAddress(userAddress) : undefined;
  const debtWei = tryParseDebt(debt);
  const lockedWei = tryParseLocked(locked);
  const ready = !!user && debtWei !== null && debtWei > BigInt(0);

  const pool = ADDRESSES.creditcoinTestnet.loanPool;
  const q = { enabled: ready } as const;

  const { data: required } = useReadContract({
    address: pool,
    abi: loanPoolAbi,
    functionName: "quoteCollateralWei",
    chainId: creditCoin3Testnet.id,
    args: ready ? [user!, debtWei!] : undefined,
    query: q,
  });
  const { data: maxB } = useReadContract({
    address: pool,
    abi: loanPoolAbi,
    functionName: "quoteMaxBorrow",
    chainId: creditCoin3Testnet.id,
    args: ready && lockedWei !== null ? [user!, lockedWei!] : undefined,
    query: { enabled: ready && lockedWei !== null },
  });
  const { data: bps } = useReadContract({
    address: pool,
    abi: loanPoolAbi,
    functionName: "getCollateralBps",
    chainId: creditCoin3Testnet.id,
    args: ready ? [user!] : undefined,
    query: q,
  });
  const { data: apr } = useReadContract({
    address: pool,
    abi: loanPoolAbi,
    functionName: "getInterestBps",
    chainId: creditCoin3Testnet.id,
    args: ready ? [user!] : undefined,
    query: q,
  });

  if (!ready) {
    return { collateralBps: null, interestBps: null, requiredCollateral: null, requiredCtC: null, requiredOk: false, maxBorrow: null, ready: false };
  }
  const requiredOk =
    required !== undefined && lockedWei !== null && lockedWei >= (required as bigint);
  return {
    collateralBps: bps === undefined ? null : Number(bps),
    interestBps: apr === undefined ? null : Number(apr),
    requiredCollateral: required === undefined ? null : `${formatEther(required as bigint)} CTC`,
    requiredCtC: required === undefined ? null : Number(formatEther(required as bigint)),
    requiredOk,
    maxBorrow:
      maxB === undefined ? null : `${formatUnits(maxB as bigint, 6)} mUSDC`,
    ready: true,
  };
}

// Takes a wallet address, reads the pool position, returns formatted
// collateral/debt/rate plus a refetch for post-tx refreshes.
export function usePosition(userAddress?: string): {
  collateral: string | null;
  debt: string | null;
  rate: number | null;
  refetch: () => void;
} {
  const user = userAddress ? getAddress(userAddress) : undefined;
  const { data, refetch } = useReadContract({
    address: ADDRESSES.creditcoinTestnet.loanPool,
    abi: loanPoolAbi,
    functionName: "getPosition",
    chainId: creditCoin3Testnet.id,
    args: user ? [user] : undefined,
    query: { enabled: !!user },
  });
  if (!user || !data) {
    return { collateral: null, debt: null, rate: null, refetch: () => refetch() };
  }
  const [col, debt, rate] = data as unknown as [bigint, bigint, number];
  if (col === BigInt(0) && debt === BigInt(0)) {
    return { collateral: null, debt: null, rate: null, refetch: () => refetch() };
  }
  return {
    collateral: `${formatEther(col)} CTC`,
    debt: `${formatUnits(debt, 6)} mUSDC`,
    rate: Number(rate),
    refetch: () => refetch(),
  };
}

export type EvidenceRow = {
  txn: string;
  protocol: string;
  kind: "repay" | "liquidation";
  amount: string;
  status: "verified" | "pending";
  txHash: string;
  chainKey: number;
  borrower: string | null;
};

export const EXPLORERS: Record<number, string> = {
  1: "https://sepolia.etherscan.io",
  3: "https://etherscan.io",
};

// Takes protocol/kind filters, fetches /api/evidence, returns rows plus
// totals. Keeps old rows visible until the new set lands.
export function useEvidence(protocol: string, kind: string): {
  rows: EvidenceRow[];
  loading: boolean;
  total: number;
  totalProved: number;
  breakdown: { protocol: string; kind: string; count: number }[];
} {
  const [state, setState] = useState<{
    rows: EvidenceRow[];
    loading: boolean;
    total: number;
    totalProved: number;
    breakdown: { protocol: string; kind: string; count: number }[];
  }>({ rows: [], loading: true, total: 0, totalProved: 0, breakdown: [] });

  useEffect(() => {
    let live = true;
    // No sync reset here: previous rows stay visible until the new set lands.
    fetch(`/api/evidence?protocol=${protocol}&kind=${kind}`)
      .then((r) => r.json())
      .then((body: EvidenceApi) => {
        if (!live) return;
        setState({
          rows: (body.rows ?? []).map((r) => ({
            txn: r.txn,
            protocol: r.protocol,
            kind: r.kind === "liquidation" ? "liquidation" : "repay",
            amount: r.amountRaw ?? "—",
            status: "verified" as const,
            txHash: r.txHash,
            chainKey: r.chainKey ?? 3,
            borrower: r.borrower ?? null,
          })),
          loading: false,
          total: body.total ?? 0,
          totalProved: body.totalProved ?? 0,
          breakdown: body.breakdown ?? [],
        });
      })
      .catch(() => {
        if (live) setState((s) => ({ ...s, loading: false }));
      });
    return () => {
      live = false;
    };
  }, [protocol, kind]);

  return state;
}

type EvidenceApiRow = {
  txn: string;
  protocol: string;
  kind: string;
  amountRaw?: string | null;
  borrower?: string | null;
  txHash: string;
  chainKey?: number | null;
};

type EvidenceApi = {
  rows?: EvidenceApiRow[];
  total?: number;
  totalProved?: number;
  breakdown?: { protocol: string; kind: string; count: number }[];
};
