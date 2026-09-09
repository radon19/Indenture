// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {MainLoanFacility} from "../src/MainLoanFacility.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {OnChainCreditScore} from "../src/creditScore.sol";

contract DeployCreditcoin is Script {
    uint256 internal constant CREDITCOIN_TESTNET_CHAIN_ID = 102_031;

    function run()
        external
        returns (
            MockUSDC stable,
            OnChainCreditScore scores,
            MainLoanFacility facility
        )
    {
        require(
            block.chainid == CREDITCOIN_TESTNET_CHAIN_ID,
            "DeployCreditcoin: wrong chain"
        );

        address sepoliaLoanFacility =
            vm.envAddress("SEPOLIA_LOAN_FACILITY");

        require(
            sepoliaLoanFacility != address(0),
            "SEPOLIA_LOAN_FACILITY is zero"
        );

        vm.startBroadcast();

        stable = new MockUSDC();

        scores = new OnChainCreditScore(
            sepoliaLoanFacility
        );

        facility = new MainLoanFacility(
            address(scores),
            address(stable)
        );

        vm.stopBroadcast();

        console2.log("MockUSDC:", address(stable));
        console2.log("OnChainCreditScore:", address(scores));
        console2.log("MainLoanFacility:", address(facility));
        console2.log(
            "Sepolia LoanFacility:",
            sepoliaLoanFacility
        );
    }
}