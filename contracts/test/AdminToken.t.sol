// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {OnChainCreditScore} from "../src/creditScore.sol";
import {ScoreHarness} from "./Harness.sol";

/// @notice Token printing rights + registry admin rails.
contract AdminTokenTest is Test {
    MockUSDC internal usdc;
    ScoreHarness internal scores;
    address internal owner = address(this);
    address internal stranger = address(0xBAD);

    function setUp() public {
        usdc = new MockUSDC();
        scores = new ScoreHarness(address(0xFACADE));
    }

    function test_mint_ownerOnly() public {
        usdc.mint(stranger, 100e6);
        assertEq(usdc.balanceOf(stranger), 100e6);
        vm.prank(stranger);
        vm.expectRevert(MockUSDC.NotOwner.selector);
        usdc.mint(stranger, 1);
    }

    function test_transferAndAllowance() public {
        usdc.mint(owner, 100e6);
        usdc.approve(stranger, 40e6);
        vm.prank(stranger);
        usdc.transferFrom(owner, stranger, 40e6);
        assertEq(usdc.balanceOf(stranger), 40e6);
    }

    function test_admin_setters_ownerOnly() public {
        address weth = scores.WETH();
        vm.startPrank(stranger);
        vm.expectRevert(OnChainCreditScore.NotOwner.selector);
        scores.setPrice(weth, 2e18);
        vm.expectRevert(OnChainCreditScore.NotOwner.selector);
        scores.registerReserve(address(0xC01), 6);
        vm.expectRevert(OnChainCreditScore.NotOwner.selector);
        scores.unpause();
        vm.stopPrank();
    }

    function test_registerReserve_opensUnknownToken() public {
        address token = address(0xC01);
        scores.registerReserve(token, 6);
        scores.setPrice(token, 1e18);
        assertEq(scores.exposedValue(token, 10e6), 10e18);
    }

    function test_price_capBoundary() public {
        address weth = scores.WETH();
        uint256 max = scores.MAX_PRICE_USD18();
        scores.setPrice(weth, max); // exactly MAX is fine
        assertEq(scores.priceUSD18(weth), max);
        vm.expectRevert(
            abi.encodeWithSelector(OnChainCreditScore.PriceTooHigh.selector, max + 1, max)
        );
        scores.setPrice(weth, max + 1);
    }

    function testFuzz_mintSupplyConserved(uint96 a, uint96 b) public {
        usdc.mint(stranger, a);
        usdc.mint(owner, b);
        assertEq(usdc.totalSupply(), uint256(a) + uint256(b));
    }

    function test_ownership_movesToMultisig() public {
        address safe = address(0x5AFE);
        scores.transferOwnership(safe);
        assertEq(scores.owner(), safe);
        vm.expectRevert(OnChainCreditScore.NotOwner.selector);
        scores.pause();
        vm.prank(safe);
        scores.pause();
        assertTrue(scores.paused());
    }

    function test_mockOwnership_moves() public {
        usdc.transferOwnership(stranger);
        assertEq(usdc.owner(), stranger);
        vm.expectRevert(MockUSDC.NotOwner.selector);
        usdc.mint(owner, 1);
    }

    function test_ownership_rejectsZero() public {
        vm.expectRevert(OnChainCreditScore.ZeroAddress.selector);
        scores.transferOwnership(address(0));
    }
}
