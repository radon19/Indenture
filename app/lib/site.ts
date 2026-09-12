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
  { name: "Platinum", score: "≥ 700 + spotless", collateral: "90%", apr: "5%", blurb: "Borrow more than you post. No defaults, ever." },
];

export const PROTOCOLS = ["aave", "spark", "compound"] as const;
export type Protocol = (typeof PROTOCOLS)[number];

export const PROTOCOL_LABEL: Record<Protocol, string> = {
  aave: "Aave V3",
  spark: "Spark",
  compound: "Compound v3",
};

export type SupportedToken = {
  symbol: string;
  address: string;
  decimals: number;
  note: string;
};

/** On-chain verified set — every entry read back from tokenDecimals after onboarding. */
export const SUPPORTED_TOKENS: SupportedToken[] = [
  { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6, note: "Fixed $1" },
  { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6, note: "Fixed $1" },
  { symbol: "DAI", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18, note: "$1" },
  { symbol: "WETH", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18, note: "Owner-priced" },
  { symbol: "WBTC", address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8, note: "Owner-priced" },
  { symbol: "cbBTC", address: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", decimals: 8, note: "Owner-priced" },
  { symbol: "cbETH", address: "0xbe9895146f7af43049ca1c1ae358b0541ea49704", decimals: 18, note: "Owner-priced" },
  { symbol: "rETH", address: "0xae78736cd615f374d3085123a210448e74fc6393", decimals: 18, note: "Owner-priced" },
  { symbol: "USDe", address: "0x4c9edd5852cd905f086c759e8383e09bff1e68b3", decimals: 18, note: "$1" },
  { symbol: "LINK", address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", decimals: 18, note: "Owner-priced" },
];

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
