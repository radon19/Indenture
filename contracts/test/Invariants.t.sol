// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {Test} from "forge-std/Test.sol";
import {ScoreHarness} from "./Harness.sol";

/// @notice Random-call driver: capacity, score bumps and defaults in any order.
contract ScoreHandler is Test {
    ScoreHarness internal scores;
    address[] public seen;

    constructor(ScoreHarness s) {
        scores = s;
    }

    function seenCount() external view returns (uint256) {
        return seen.length;
    }

    function _user(uint8 who) internal returns (address u) {
        u = address(uint160(0x1000 + (who % 8)));
    }

    function addCapacity(uint256 amt, uint8 bit, uint8 who) external {
        amt = bound(amt, 0, 1_000_000e18);
        bit &= 7;
        if (bit == 0) bit = 1;
        address u = _user(who);
        _note(u);
        scores.exposedAddCapacity(u, amt, bit);
    }

    function bump(uint256 amt, uint8 who) external {
        amt = bound(amt, 0, 10_000e18);
        address u = _user(who);
        _note(u);
        scores.exposedIncrease(u, amt);
    }

    function slash(uint256 severity, uint8 who) external {
        severity = bound(severity, 0, 10_000e18);
        address u = _user(who);
        _note(u);
        scores.exposedDecrease(u, severity);
    }

    function _note(address u) internal {
        for (uint256 i; i < seen.length; ++i) if (seen[i] == u) return;
        seen.push(u);
    }
}

/// @notice Properties that must hold no matter the call order.
contract InvariantsTest is Test {
    ScoreHarness internal scores;
    ScoreHandler internal handler;

    function setUp() public {
        scores = new ScoreHarness(address(0xFACADE));
        handler = new ScoreHandler(scores);
        targetContract(address(handler));
    }

    function invariant_scoreStaysInRange() public view {
        for (uint256 i; i < handler.seenCount(); ++i) {
            uint16 s = scores.getScore(handler.seen(i));
            assertGe(s, 400);
            assertLe(s, 900);
        }
    }

    function invariant_maxNeverExceedsSum() public view {
        for (uint256 i; i < handler.seenCount(); ++i) {
            assertLe(scores.getMaxRepayment(handler.seen(i)), scores.getCapacity(handler.seen(i)));
        }
    }

    function invariant_termsStayInBounds() public view {
        for (uint256 i; i < handler.seenCount(); ++i) {
            address u = handler.seen(i);
            uint32 bps = scores.getCollateralBps(u);
            assertTrue(bps == 9000 || bps == 11000 || bps == 13000 || bps == 15000);
            assertLe(scores.getInterestBps(u), 2500);
        }
    }
}
