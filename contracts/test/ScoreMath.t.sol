// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {Test} from "forge-std/Test.sol";
import {ScoreCalculateLib} from "../src/ScoreCalculateLib.sol";

/// @notice Pins the points math: brackets, dust line, caps, monotonicity.
contract ScoreMathTest is Test {
    function test_points_dustLine() public pure {
        assertEq(ScoreCalculateLib.getPoints(0), 0);
        assertEq(ScoreCalculateLib.getPoints(1e15 - 1), 0);
        assertEq(ScoreCalculateLib.getPoints(1e15), 1);
    }

    function test_points_brackets() public pure {
        assertEq(ScoreCalculateLib.getPoints(1e15), 1); // $0.001
        assertEq(ScoreCalculateLib.getPoints(1e16 - 1), 1);
        assertEq(ScoreCalculateLib.getPoints(1e16), 2); // $0.01
        assertEq(ScoreCalculateLib.getPoints(1e17 - 1), 2);
        assertEq(ScoreCalculateLib.getPoints(1e17), 4); // $0.10
        assertEq(ScoreCalculateLib.getPoints(1e18 - 1), 4);
        assertEq(ScoreCalculateLib.getPoints(1e18), 8); // $1
        assertEq(ScoreCalculateLib.getPoints(10e18 - 1), 8);
        assertEq(ScoreCalculateLib.getPoints(10e18), 16); // $10
        assertEq(ScoreCalculateLib.getPoints(100e18 - 1), 16);
        assertEq(ScoreCalculateLib.getPoints(100e18), 32); // $100
        assertEq(ScoreCalculateLib.getPoints(1_000e18 - 1), 32);
        assertEq(ScoreCalculateLib.getPoints(1_000e18), 50); // $1000+
        assertEq(ScoreCalculateLib.getPoints(1_000_000e18), 50);
    }

    function test_applyIncrease_capsAtMax() public pure {
        (uint16 next, uint16 gained) = ScoreCalculateLib.applyIncrease(880, 900, 1_000e18);
        assertEq(gained, 50);
        assertEq(next, 900);
    }

    function test_applyIncrease_dustIsZero() public pure {
        (uint16 next, uint16 gained) = ScoreCalculateLib.applyIncrease(600, 900, 100);
        assertEq(gained, 0);
        assertEq(next, 600);
    }

    function test_normalise_decimals() public pure {
        assertEq(ScoreCalculateLib.normalise(100e6, 6), 100e18); // USDC
        assertEq(ScoreCalculateLib.normalise(1e8, 8), 1e18); // WBTC
        assertEq(ScoreCalculateLib.normalise(5e18, 18), 5e18); // WETH
    }

    function testFuzz_pointsNeverExceed50(uint256 amount) public pure {
        assertLe(ScoreCalculateLib.getPoints(amount), 50);
    }

    function testFuzz_pointsMonotonic(uint256 a, uint256 b) public pure {
        vm.assume(a <= b);
        assertLe(ScoreCalculateLib.getPoints(a), ScoreCalculateLib.getPoints(b));
    }

    function testFuzz_applyIncreaseNeverExceedsMax(uint16 current, uint256 amount) public pure {
        vm.assume(current >= 400 && current <= 900);
        (uint16 next,) = ScoreCalculateLib.applyIncrease(current, 900, amount);
        assertLe(next, 900);
    }
}
