// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.23;

import {SafeProxy} from "./proxies/SafeProxy.sol";
import {Safe} from "./Safe.sol";

/// @notice CREATE-based Safe creation for chains that gate CREATE2.
/// Deploys the proxy and runs setup atomically — no frontrunning window.
contract SafeDeployer {
    event SafeCreated(address indexed proxy, address indexed singleton);

    function create(
        address singleton,
        address[] calldata owners,
        uint256 threshold,
        address handler
    ) external returns (address proxy) {
        proxy = address(new SafeProxy(singleton));
        bytes memory init = abi.encodeWithSelector(
            Safe.setup.selector,
            owners,
            threshold,
            address(0),
            bytes(""),
            handler,
            address(0),
            uint256(0),
            payable(address(0))
        );
        (bool ok,) = proxy.call(init);
        require(ok, "setup failed");
        emit SafeCreated(proxy, singleton);
    }
}
