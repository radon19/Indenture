// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {Test} from "forge-std/Test.sol";
import {MainLoanFacility} from "../src/MainLoanFacility.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {OnChainCreditScore} from "../src/creditScore.sol";

/// @notice The mock pool, worked end to end: borrow, interest, repay, liquidate.
contract MainLoanFacilityTest is Test {
    MainLoanFacility internal pool;
    MockUSDC internal usdc;
    OnChainCreditScore internal scores;
    address internal alice = address(0xA11CE);

    function setUp() public {
        usdc = new MockUSDC();
        scores = new OnChainCreditScore(address(0xFACADE));
        pool = new MainLoanFacility(address(scores), address(usdc));
        usdc.mint(address(pool), 1_000_000e6);
        vm.deal(alice, 1000 ether);
    }

    function _borrowAlice(uint256 debt, uint256 collateral) internal {
        vm.prank(alice);
        pool.borrow{value: collateral}(debt);
    }

    function test_borrow_locksCollateralAndPaysOut() public {
        _borrowAlice(100e6, 150 ether); // Bronze: 150% of $100
        assertEq(usdc.balanceOf(alice), 100e6);
        (uint256 col,,) = pool.getPosition(alice);
        assertEq(col, 150 ether);
    }

    function test_borrow_rejectsThinCollateral() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(MainLoanFacility.NeedMoreCollateral.selector, 10 ether, 150 ether)
        );
        pool.borrow{value: 10 ether}(100e6);
    }

    function test_borrow_rejectsBeyondLiquidity() public {
        MainLoanFacility empty = new MainLoanFacility(address(scores), address(usdc));
        vm.prank(alice);
        vm.expectRevert();
        empty.borrow{value: 200 ether}(100e6);
    }

    function test_interest_accruesWithWarp() public {
        _borrowAlice(100e6, 150 ether); // $100 @ 18% Bronze
        vm.warp(block.timestamp + 365 days);
        uint256 due = pool.interestDue(alice);
        assertApproxEqAbs(due, 18e6, 1e6); // ~$18 simple interest
        assertApproxEqAbs(pool.totalOwed(alice), 118e6, 1e6);
    }

    function test_repay_interestFirst() public {
        _borrowAlice(100e6, 150 ether);
        vm.warp(block.timestamp + 365 days);
        usdc.mint(alice, 200e6);
        vm.prank(alice);
        usdc.approve(address(pool), 200e6);
        vm.prank(alice);
        pool.repay(18e6); // covers ~interest only
        (, uint256 debt,) = pool.getPosition(alice);
        assertApproxEqAbs(debt, 100e6, 2e6); // principal untouched
        vm.prank(alice);
        pool.repay(200e6); // capped at owed, closes all
        (, uint256 debtLeft,) = pool.getPosition(alice);
        assertEq(debtLeft, 0);
    }

    function test_withdraw_checked() public {
        _borrowAlice(100e6, 300 ether);
        vm.prank(alice);
        pool.withdrawCollateral(100 ether);
        (uint256 col,,) = pool.getPosition(alice);
        assertEq(col, 200 ether);
        vm.prank(alice);
        vm.expectRevert(MainLoanFacility.UnsafeWithdraw.selector);
        pool.withdrawCollateral(100 ether); // would leave 100 < 150 need
    }

    function test_liquidate_afterInterestEatsBuffer() public {
        _borrowAlice(100e6, 150 ether); // exactly at Bronze need
        vm.warp(block.timestamp + 365 days); // +$18 interest -> underwater
        pool.liquidate(alice);
        (uint256 col, uint256 debt,) = pool.getPosition(alice);
        assertEq(col, 0);
        assertEq(debt, 0);
    }

    function test_liquidate_revertsWhenHealthy() public {
        _borrowAlice(100e6, 500 ether);
        vm.expectRevert(MainLoanFacility.NotLiquidatable.selector);
        pool.liquidate(alice);
    }

    function test_seed_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(MainLoanFacility.NotOwner.selector);
        pool.seedStable(1);
    }
}
