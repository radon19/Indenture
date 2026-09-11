/** Shared site truth. Numbers mirror the contracts; retrieval hooks live in ./stubs. */

export const ADDRESSES = {
  sepolia: {
    chainId: 11155111,
    loanFacility: "0xbdf493355791f129aad0b11c912b271ca8558387",
  },
  creditcoinTestnet: {
    chainId: 102031,
    mockUSDC: "0xfdcdfbd1533dfa005e7be3c4d82d95c98fadcd39",
    creditScore: "0xFA19b4DDCEA765Ce8662ec9ea15438Adce44E237",
    loanPool: "0x5e78fb780f43b31B9b32d84C4482e4A8eD89DD4d",
  },
} as const;

export type TierName = "Bronze" | "Silver" | "Gold" | "Platinum";

export const TIERS: {
  name: TierName;
  score: string;
  collateral: string;
  apr: string;
  blurb: string;
}[] = [
  { name: "Bronze", score: "< 250", collateral: "150%", apr: "18%", blurb: "Starting terms. Every wallet begins here." },
  { name: "Silver", score: "≥ 250", collateral: "130%", apr: "12%", blurb: "Proven repayment volume on record." },
  { name: "Gold", score: "≥ 500", collateral: "110%", apr: "8%", blurb: "Deep history across venues." },
  { name: "Platinum", score: "≥ 700 + spotless", collateral: "85%", apr: "6%", blurb: "Borrow more than you post. No defaults, ever." },
];

export const PROTOCOLS = ["aave", "spark", "compound"] as const;
export type Protocol = (typeof PROTOCOLS)[number];

export const PROTOCOL_LABEL: Record<Protocol, string> = {
  aave: "Aave V3",
  spark: "Spark",
  compound: "Compound v3",
};

/** proof.json record shape (contracts/proof.json). */
export type ProofRecord = {
  txn: string;
  protocol: string;
  proofbody: string;
};

export const SCORE_BRACKETS: { range: string; points: string }[] = [
  { range: "< $0.001", points: "0 — ignored as dust" },
  { range: "$0.001 – $0.01", points: "+1" },
  { range: "$0.01 – $0.10", points: "+2" },
  { range: "$0.10 – $1", points: "+4" },
  { range: "$1 – $10", points: "+8" },
  { range: "$10 – $100", points: "+16" },
  { range: "$100 – $2,500", points: "+32" },
  { range: "≥ $2,500", points: "+50" },
];

export const PENALTY_BRACKETS: { range: string; penalty: string }[] = [
  { range: "≤ $50 defaulted", penalty: "−20" },
  { range: "$50 – $1,000", penalty: "−60" },
  { range: "> $1,000", penalty: "−120" },
];
