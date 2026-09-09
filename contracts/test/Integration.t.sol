// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {Test} from "forge-std/Test.sol";
import {MainLoanFacility} from "../src/MainLoanFacility.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {ScoreHarness} from "./Harness.sol";

/// @notice The two contracts as one system: tiers priced live from proven history.
contract IntegrationTest is Test {
    ScoreHarness internal scores;
    MockUSDC internal usdc;
    MainLoanFacility internal pool;
    address internal alice = address(0xA11CE);

    function setUp() public {
        usdc = new MockUSDC();
        scores = new ScoreHarness(address(0xFACADE));
        pool = new MainLoanFacility(address(scores), address(usdc));
        usdc.mint(address(pool), 1_000_000e6);
        vm.deal(alice, 1000 ether);
    }

    function test_goldTermsThroughLiveRegistry() public {
        scores.exposedAddCapacity(alice, 500e18, 1);
        scores.exposedAddCapacity(alice, 500e18, 2);
        vm.prank(alice);
        pool.borrow{value: 110 ether}(100e6); // Gold 110%: Bronze would revert at 150
        (,, uint16 rate) = pool.getPosition(alice);
        assertEq(rate, 800);
    }

    function test_downgradeKeepsFrozenRate() public {
        scores.exposedAddCapacity(alice, 500e18, 1);
        scores.exposedAddCapacity(alice, 500e18, 2);
        vm.prank(alice);
        pool.borrow{value: 200 ether}(100e6);
        scores.exposedDecrease(alice, 5000e18); // default: live rate rises
        assertGt(pool.getInterestBps(alice), 800);
        (,, uint16 frozen) = pool.getPosition(alice);
        assertEq(frozen, 800); // open loan untouched
        vm.prank(alice);
        pool.withdrawCollateral(10 ether); // still serviceable
    }

    function test_poolPauseMatrix() public {
        pool.pause();
        assertTrue(pool.paused());
        vm.prank(alice);
        vm.expectRevert(MainLoanFacility.EnforcedPause.selector);
        pool.borrow{value: 200 ether}(100e6);
        vm.prank(alice);
        vm.expectRevert(MainLoanFacility.EnforcedPause.selector);
        pool.addCollateral{value: 1 ether}();
        pool.seedStable(0); // funding stays open during pause
        pool.unpause();
        vm.prank(alice);
        pool.borrow{value: 200 ether}(100e6);
    }

    function test_poolOwnership() public {
        address safe = address(0x5AFE);
        pool.transferOwnership(safe);
        assertEq(pool.owner(), safe);
        vm.expectRevert(MainLoanFacility.NotOwner.selector);
        pool.pause();
    }

    function test_strayEthReverts() public {
        vm.prank(alice);
        (bool ok,) = address(pool).call{value: 1 wei}("");
        assertFalse(ok); // no receive(): accidents bounce, nothing locks silently
    }

    function test_liquidateRefundExact() public {
        vm.prank(alice);
        pool.borrow{value: 150 ether}(100e6);
        vm.warp(block.timestamp + 730 days); // +$36 interest -> $136 owed, need 204 ether
        pool.liquidate(alice);
        assertEq(alice.balance, 1000 ether - 150 ether + 14 ether);
        (uint256 col, uint256 debt,) = pool.getPosition(alice);
        assertEq(col, 0);
        assertEq(debt, 0);
    }
}
