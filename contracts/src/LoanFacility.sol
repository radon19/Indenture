// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

/// @title LoanFacility
/// @notice Minimal Sepolia history ledger. No funds move; disbursement is out of scope.
/// @dev Deploy on Ethereum Sepolia. Event wire format is a cross-chain ABI:
/// `OnChainCreditScore` decodes these logs from proven receipts, so moving a field
/// between topics and data, or changing a signature, breaks verification.
/// Borrower opens their own loan (consent); anyone may repay it (credit accrues to
/// the borrower); anyone may mark a genuinely overdue loan defaulted (chain clock
/// proves lateness, so post-due marking is truthful, not griefing).
contract LoanFacility {
    struct Loan {
        address borrower;
        uint256 principal;
        uint256 repaid;
        uint64 dueAt;
        bool defaulted;
        bool exists;
    }

    uint256 public nextLoanId = 1;
    mapping(uint256 => Loan) public loans;

    // Wire format pinned: LoanOpened(uint256,address,uint256,uint64).
    event LoanOpened(
        uint256 indexed loanId,
        address indexed borrower,
        uint256 principal,
        uint64 dueAt
    );
    // Wire format pinned: LoanRepaid(uint256,address,uint256,uint256).
    event LoanRepaid(
        uint256 indexed loanId,
        address indexed borrower,
        uint256 amount,
        uint256 remaining
    );
    // Wire format pinned: LoanDefaulted(uint256,address,uint256).
    event LoanDefaulted(uint256 indexed loanId, address indexed borrower, uint256 remaining);

    error ZeroPrincipal();
    error ZeroDuration();
    error ZeroAmount();
    error UnknownLoan();
    error AlreadyClosed();
    error AlreadyDefaulted();
    error NotDue();
    error BadValue();
    error TimestampOverflow();

    /// @notice Opens a loan for the caller. No funds move.
    function openLoan(uint256 principal, uint64 durationSecs) external returns (uint256 loanId) {
        if (principal == 0) revert ZeroPrincipal();
        if (durationSecs == 0) revert ZeroDuration();
        if (block.timestamp + durationSecs > type(uint64).max) revert TimestampOverflow();

        loanId = nextLoanId++;
        uint64 dueAt = uint64(block.timestamp + durationSecs);

        loans[loanId] = Loan({
            borrower: msg.sender,
            principal: principal,
            repaid: 0,
            dueAt: dueAt,
            defaulted: false,
            exists: true
        });

        emit LoanOpened(loanId, msg.sender, principal, dueAt);
    }

    /// @notice Repays a loan, wholly or partially. Permissionless; credit accrues
    /// to the borrower. Allowed even after default so debt can still be settled.
    function repay(uint256 loanId, uint256 amount) external {
        Loan storage loan = loans[loanId];
        if (!loan.exists) revert UnknownLoan();
        if (amount == 0) revert ZeroAmount();

        uint256 remaining = loan.principal - loan.repaid;
        if (remaining == 0) revert AlreadyClosed();
        if (amount > remaining) revert BadValue();

        loan.repaid += amount;
        remaining = loan.principal - loan.repaid;

        emit LoanRepaid(loanId, loan.borrower, amount, remaining);
    }

    /// @notice Marks a genuinely overdue loan defaulted. Anyone may call once due.
    function markDefault(uint256 loanId) external {
        Loan storage loan = loans[loanId];
        if (!loan.exists) revert UnknownLoan();
        if (loan.defaulted) revert AlreadyDefaulted();
        if (loan.repaid >= loan.principal) revert AlreadyClosed();
        if (block.timestamp < loan.dueAt) revert NotDue();

        loan.defaulted = true;
        emit LoanDefaulted(loanId, loan.borrower, loan.principal - loan.repaid);
    }
}
