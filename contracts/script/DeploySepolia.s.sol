// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {LoanFacility} from "../src/LoanFacility.sol";

contract DeploySepolia is Script {
    uint256 internal constant SEPOLIA_CHAIN_ID = 11_155_111;

    function run() external returns (LoanFacility loanFacility) {
        require(block.chainid == SEPOLIA_CHAIN_ID, "DeploySepolia: wrong chain");

        vm.startBroadcast();

        loanFacility = new LoanFacility();

        vm.stopBroadcast();

        console2.log("LoanFacility deployed:", address(loanFacility));
    }
}