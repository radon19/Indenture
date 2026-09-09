// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

/// @title LoanFacility
/// @notice Minimal Sepolia LoanFacility.
/// @dev Deploy on Ethereum Sepolia. 
contract LoanFacility {
    struct Loan {
        address borrower;
        address lender;
        uint256 principal;
        uint256 repaid;
        uint64 dueAt;
        bool defaulted;
        bool exists;
    }

    uint256 public nextLoanId = 1;
    mapping(uint256 => Loan) public loans;

    event LoanOpened(
        uint256 indexed loanId,
        address indexed borrower,
        address indexed lender,
        uint256 principal,
        uint64 dueAt
    );
    event LoanRepaid(
        uint256 indexed loanId,
        address indexed borrower,
        uint256 amount,
        uint256 remaining
    );
    event LoanDefaulted(uint256 indexed loanId, address indexed borrower, uint256 remaining);

    error ZeroAddress();
    error ZeroAmount();
    error UnknownLoan();
    error NotBorrower();
    error AlreadyDefaulted();
    error AlreadyClosed();
    error NotDue();
    error BadValue();

    function openLoan(address borrower, uint64 durationSecs) external payable returns (uint256 loanId) {
        if (borrower == address(0)) revert ZeroAddress();
        if (msg.value == 0) revert ZeroAmount();

        loanId = nextLoanId++;
        uint64 dueAt = uint64(block.timestamp + durationSecs);

        loans[loanId] = Loan({
            borrower: borrower,
            lender: msg.sender,
            principal: msg.value,
            repaid: 0,
            dueAt: dueAt,
            defaulted: false,
            exists: true
        });

        (bool ok,) = payable(borrower).call{value: msg.value}("");
        require(ok, "send failed");

        emit LoanOpened(loanId, borrower, msg.sender, msg.value, dueAt);
    }

    function repay(uint256 loanId) external payable {
        Loan storage loan = loans[loanId];
        if (!loan.exists) revert UnknownLoan();
        if (msg.sender != loan.borrower) revert NotBorrower();
        if (loan.defaulted) revert AlreadyDefaulted();
        if (msg.value == 0) revert ZeroAmount();

        uint256 remaining = loan.principal - loan.repaid;
        if (remaining == 0) revert AlreadyClosed();
        if (msg.value > remaining) revert BadValue();

        loan.repaid += msg.value;
        remaining = loan.principal - loan.repaid;

        (bool ok,) = payable(loan.lender).call{value: msg.value}("");
        require(ok, "refund lender failed");

        emit LoanRepaid(loanId, loan.borrower, msg.value, remaining);
    }

    function markDefault(uint256 loanId) external {
        Loan storage loan = loans[loanId];
        if (!loan.exists) revert UnknownLoan();
        if (loan.defaulted) revert AlreadyDefaulted();
        if (loan.repaid >= loan.principal) revert AlreadyClosed();
        if (block.timestamp < loan.dueAt && msg.sender != loan.lender) revert NotDue();

        loan.defaulted = true;
        emit LoanDefaulted(loanId, loan.borrower, loan.principal - loan.repaid);
    }
}