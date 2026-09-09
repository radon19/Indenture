// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {Test} from "forge-std/Test.sol";
import {LoanFacility} from "../src/LoanFacility.sol";

/// @notice The mock ledger: consent, bounds, truthful defaults.
contract LoanFacilityTest is Test {
    LoanFacility internal book;
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    function setUp() public {
        book = new LoanFacility();
    }

    function test_open_selfCustody() public {
        vm.prank(alice);
        uint256 id = book.openLoan(100 ether, 30 days);
        assertEq(id, 1);
        (address borrower, uint256 principal,,,,) = book.loans(id);
        assertEq(borrower, alice);
        assertEq(principal, 100 ether);
    }

    function test_open_rejectsZeros() public {
        vm.expectRevert(LoanFacility.ZeroPrincipal.selector);
        book.openLoan(0, 30 days);
        vm.expectRevert(LoanFacility.ZeroDuration.selector);
        book.openLoan(1 ether, 0);
    }

    function test_repay_partialAndFull() public {
        vm.prank(alice);
        uint256 id = book.openLoan(100 ether, 30 days);
        book.repay(id, 40 ether);
        (,, uint256 repaid,,,) = book.loans(id);
        assertEq(repaid, 40 ether);
        book.repay(id, 60 ether);
        (,, uint256 repaid2,,,) = book.loans(id);
        assertEq(repaid2, 100 ether);
    }

    function test_repay_anyonePaysBorrowerEarns() public {
        vm.prank(alice);
        uint256 id = book.openLoan(100 ether, 30 days);
        vm.prank(bob);
        book.repay(id, 100 ether); // stranger pays, no revert, borrower credited
        (,, uint256 repaid,,,) = book.loans(id);
        assertEq(repaid, 100 ether);
    }

    function test_repay_rejectsUnknownClosedOverpay() public {
        vm.expectRevert(LoanFacility.UnknownLoan.selector);
        book.repay(999, 1);
        vm.prank(alice);
        uint256 id = book.openLoan(10 ether, 30 days);
        vm.expectRevert(LoanFacility.BadValue.selector);
        book.repay(id, 11 ether);
        book.repay(id, 10 ether);
        vm.expectRevert(LoanFacility.AlreadyClosed.selector);
        book.repay(id, 1);
    }

    function test_default_onlyWhenDue() public {
        vm.prank(alice);
        uint256 id = book.openLoan(10 ether, 30 days);
        vm.expectRevert(LoanFacility.NotDue.selector);
        book.markDefault(id);
        vm.warp(block.timestamp + 30 days + 1);
        book.markDefault(id);
        (,,,, bool defaulted,) = book.loans(id);
        assertTrue(defaulted);
        vm.expectRevert(LoanFacility.AlreadyDefaulted.selector);
        book.markDefault(id);
    }

    function test_repay_afterDefault_allowed() public {
        vm.prank(alice);
        uint256 id = book.openLoan(10 ether, 1 days);
        vm.warp(block.timestamp + 2 days);
        book.markDefault(id);
        book.repay(id, 10 ether); // debt still settleable
        (,, uint256 repaid,,,) = book.loans(id);
        assertEq(repaid, 10 ether);
    }

    function test_ids_increment() public {
        vm.prank(alice);
        assertEq(book.openLoan(1, 1), 1);
        assertEq(book.openLoan(1, 1), 2);
    }

    function testFuzz_dueDateBounds(uint64 duration) public {
        vm.assume(duration > 0);
        uint64 headroom = type(uint64).max - uint64(block.timestamp);
        if (duration > headroom) {
            vm.expectRevert(LoanFacility.TimestampOverflow.selector);
            book.openLoan(1 ether, duration);
        } else {
            vm.prank(alice);
            uint256 id = book.openLoan(1 ether, duration);
            (,,, uint64 dueAt,,) = book.loans(id);
            assertEq(dueAt, uint64(block.timestamp) + duration);
        }
    }

    function testFuzz_repayNeverExceedsPrincipal(uint96 a, uint96 b) public {        vm.assume(a > 0 && b > 0);
        vm.prank(alice);
        uint256 id = book.openLoan(uint256(a) + uint256(b), 30 days);
        book.repay(id, a);
        (,, uint256 repaid,,,) = book.loans(id);
        assertLe(repaid, uint256(a) + uint256(b));
    }

}
