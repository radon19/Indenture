// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.23;

import {Script, console2} from "forge-std/Script.sol";
import {Safe} from "../src/Safe.sol";
import {SafeProxyFactory} from "../src/proxies/SafeProxyFactory.sol";
import {CompatibilityFallbackHandler} from "../src/handler/CompatibilityFallbackHandler.sol";
import {MultiSend} from "../src/libraries/MultiSend.sol";

/// @notice Deploys official Safe v1.4.1 infra + creates one Safe. No custom crypto.
/// Env: OWNER1, OWNER2, OWNER3 (2-of-3 fixed), SALT_NONCE.
contract DeploySafe is Script {
    function run() external {
        address[] memory owners = new address[](3);
        owners[0] = vm.envAddress("OWNER1");
        owners[1] = vm.envAddress("OWNER2");
        owners[2] = vm.envAddress("OWNER3");
        uint256 threshold = 2;
        uint256 saltNonce = vm.envUint("SALT_NONCE");

        vm.startBroadcast();

        CompatibilityFallbackHandler handler = new CompatibilityFallbackHandler();
        Safe singleton = new Safe();
        SafeProxyFactory factory = new SafeProxyFactory();
        MultiSend multiSend = new MultiSend();

        bytes memory initializer = abi.encodeWithSelector(
            Safe.setup.selector,
            owners,
            threshold,
            address(0),
            bytes(""),
            address(handler),
            address(0),
            uint256(0),
            payable(address(0))
        );
        address safe = address(
            factory.createProxyWithNonce(address(singleton), initializer, saltNonce)
        );

        vm.stopBroadcast();

        console2.log("HANDLER:", address(handler));
        console2.log("SINGLETON:", address(singleton));
        console2.log("FACTORY:", address(factory));
        console2.log("MULTISEND:", address(multiSend));
        console2.log("SAFE:", safe);
    }
}
