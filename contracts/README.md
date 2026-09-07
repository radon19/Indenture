# Credit Covenant contracts

Project contract layer for a Creditcoin Attestcoin-backed credit facility.

## Layout

- `interface/INativeQueryVerifier.sol` — native verifier interface at `0xFD2`.
- `helper/USCBase.sol` — replay protection + native proof verification base.
- `helper/EvmV1Decoder.sol` — provided EVM transaction/receipt decoder.
- `interface/ICovenantManager.sol` — covenant boundary.
- `interface/ILoanManager.sol` — loan/covenant callback boundary.
- `interface/IRiskModule.sol` — underwriting/profile boundary.
- `interface/IERC20Minimal.sol` — minimal ERC-20 interface; no OpenZeppelin dependency.
- `src/CreditCovenantVerifier.sol` — Attestcoin proof ingress and verified event extraction.
- `src/CovenantManager.sol` — monthly inflow/payment covenant state.
- `src/LoanManager.sol` — collateralized credit facility, draw, repay and enforcement state.
- `src/RiskModule.sol` — transparent on-chain underwriting formula using verified USDC inflows and Aave repayments.
- `src/LiquidationModule.sol` — default liquidation entry point.

## Source event

The verifier recognizes:

`PaymentSettled(bytes32 indexed facilityId, address indexed recipient, uint256 amount)`

It also recognizes standard USDC `Transfer` and Aave V3 `Repay(address indexed reserve, address indexed user, address indexed repayer, uint256 amount, bool useATokens)` events when those source contracts are configured.

## Initial chain configuration

The verifier is multi-source-chain. Configure CC3 chain keys in deployment/configuration calls instead of hardcoding EVM chain IDs.

Common CC3 values currently used by public integrations:

- Sepolia: `chainKey = 1`
- Ethereum Mainnet: `chainKey = 3`

## Deployment order

1. `RiskModule`
2. `CovenantManager`
3. `LoanManager(covenantManager, riskModule)`
4. `LiquidationModule(loanManager)`
5. `CreditCovenantVerifier(covenantManager, riskModule)`
6. `CovenantManager.setLoanManager(loanManager)`
7. `CovenantManager.setVerifier(creditCovenantVerifier)`
8. `RiskModule.setVerifier(creditCovenantVerifier)`
9. `LoanManager.setLiquidationModule(liquidationModule)`
10. `CreditCovenantVerifier.setSourceConfig(...)` for the source chain(s)

## Important MVP assumption

`LoanManager` uses the same ERC-20 token for loan asset and collateral. This keeps the collateral ratio value-safe without adding an external price oracle. Add a trusted price oracle before supporting different collateral and loan assets.

The contract set intentionally has no OpenZeppelin dependency; `IERC20Minimal.sol` is included locally.
