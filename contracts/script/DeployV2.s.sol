// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {OnChainCreditScore} from "../src/creditScore.sol";
import {MainLoanFacility} from "../src/MainLoanFacility.sol";

/// @notice Redeploys scores + pool only. Stable + Sepolia ledger are reused.
contract DeployV2 is Script {
    uint256 internal constant CREDITCOIN_TESTNET_CHAIN_ID = 102_031;

    address internal constant SEPOLIA_FACILITY = 0xbDF493355791f129aAD0b11C912B271cA8558387;
    address internal constant STABLE = 0xFdCDfbd1533DFA005E7BE3c4d82d95c98Fadcd39;

    function run() external {
        require(block.chainid == CREDITCOIN_TESTNET_CHAIN_ID, "DeployV2: wrong chain");
        vm.startBroadcast();
        OnChainCreditScore scores = new OnChainCreditScore(SEPOLIA_FACILITY);
        MainLoanFacility pool = new MainLoanFacility(address(scores), STABLE);
        vm.stopBroadcast();
        console2.log("NEWSCORES:", address(scores));
        console2.log("NEWPOOL:", address(pool));
    }
}
