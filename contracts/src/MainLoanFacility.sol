// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {IOnChainCreditScore} from "./interfaces/IOnChainCreditScore.sol";

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address a) external view returns (uint256);
}

/// @notice Mock pool: CTC in, mockUSDC out. Fixed 1:1 for demo, no oracle.
/// @dev Collateral ratio + APR come from OnChainCreditScore tiers. Interest is
/// simple (not compounding): payments cover banked interest first, then principal.
contract MainLoanFacility {
    uint32 public constant BPS = 10_000;
    uint256 private constant YEAR = 365 days;

    IOnChainCreditScore public immutable scores;
    IERC20 public immutable stable;
    address public owner;

    struct Position {
        uint256 collateralWei;
        uint256 debt;
        uint256 accruedInterest;
        uint64 lastAccrual;
        uint16 interestBps; // rate snapshot at last borrow
    }

    mapping(address => Position) public positions;

    bool private locked;

    event Borrowed(
        address indexed user,
        uint256 amount,
        uint256 totalDebt,
        uint256 collateralWei,
        uint32 collateralBps,
        uint16 interestBps
    );
    event Repaid(
        address indexed user,
        uint256 paid,
        uint256 interestPaid,
        uint256 principalPaid,
        uint256 debtLeft
    );
    event CollateralAdded(address indexed user, uint256 amount);
    event CollateralWithdrawn(address indexed user, uint256 amount);
    event Liquidated(address indexed borrower, address indexed by, uint256 seized, uint256 refund);

    error NotOwner();
    error ZeroAmount();
    error ExceedsCollateral(uint256 requested, uint256 available);
    error NeedMoreCollateral(uint256 have, uint256 need);
    error NoDebt();
    error TransferFailed();
    error UnsafeWithdraw();
    error InsufficientLiquidity(uint256 requested, uint256 available);
    error NotLiquidatable();
    error Reentry();

    constructor(address score_, address stable_) {
        scores = IOnChainCreditScore(score_);
        stable = IERC20(stable_);
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (locked) revert Reentry();
        locked = true;
        _;
        locked = false;
    }

    //frontend — same number as creditScore.getCollateralBps
    function getCollateralBps(address user) public view returns (uint32) {
        return scores.getCollateralBps(user);
    }

    //frontend
    function getCollateralPercent(address user) external view returns (uint16) {
        return uint16(getCollateralBps(user) / 100);
    }

    //frontend
    function getInterestBps(address user) public view returns (uint16) {
        return scores.getInterestBps(user);
    }

    //frontend
    function quoteCollateralWei(address user, uint256 debtAmount) public view returns (uint256) {
        return _collateralFor(debtAmount, getCollateralBps(user));
    }

    //frontend
    function quoteMaxBorrow(address user, uint256 collateralWei) public view returns (uint256) {
        uint32 bps = getCollateralBps(user);
        if (bps == 0) return 0;
        return (collateralWei * BPS) / (bps * 1e12);
    }

    //frontend
    function preview(address user)
        external
        view
        returns (
            uint16 score,
            uint32 collateralBps,
            uint16 collateralPercent,
            uint16 interestBps,
            uint16 interestPercent,
            uint256 collateralWei,
            uint256 debt,
            uint256 maxBorrowOnLocked,
            uint256 poolStable
        )
    {
        Position memory p = positions[user];
        score = scores.getScore(user);
        collateralBps = scores.getCollateralBps(user);
        collateralPercent = uint16(collateralBps / 100);
        interestBps = scores.getInterestBps(user);
        interestPercent = interestBps / 100;
        collateralWei = p.collateralWei;
        debt = p.debt + _pendingInterest(p);
        maxBorrowOnLocked = p.collateralWei == 0 ? 0 : quoteMaxBorrow(user, p.collateralWei);
        poolStable = stable.balanceOf(address(this));
    }

    //frontend
    function getPosition(address user)
        external
        view
        returns (uint256 collateralWei, uint256 debt, uint16 interestBps)
    {
        Position memory p = positions[user];
        return (p.collateralWei, p.debt + _pendingInterest(p), p.interestBps);
    }

    /// @notice Interest owed so far: banked + pending, simple on outstanding principal.
    function interestDue(address borrower) public view returns (uint256) {
        Position memory p = positions[borrower];
        return p.accruedInterest + _pendingInterest(p);
    }

    /// @notice Total owed to fully close: principal + all interest.
    function totalOwed(address borrower) public view returns (uint256) {
        Position memory p = positions[borrower];
        return p.debt + p.accruedInterest + _pendingInterest(p);
    }

    function borrow(uint256 debtAmount) external payable nonReentrant {
        if (debtAmount == 0) revert ZeroAmount();

        uint32 colBps = scores.getCollateralBps(msg.sender);
        uint16 rateBps = scores.getInterestBps(msg.sender);

        Position storage p = positions[msg.sender];
        _accrue(p);
        p.collateralWei += msg.value;
        p.debt += debtAmount;
        p.interestBps = rateBps;

        uint256 need = _collateralFor(p.debt, colBps);
        if (p.collateralWei < need) revert NeedMoreCollateral(p.collateralWei, need);

        uint256 available = stable.balanceOf(address(this));
        if (debtAmount > available) revert InsufficientLiquidity(debtAmount, available);

        if (!stable.transfer(msg.sender, debtAmount)) revert TransferFailed();
        emit Borrowed(msg.sender, debtAmount, p.debt, p.collateralWei, colBps, rateBps);
    }

    function addCollateral() external payable nonReentrant {
        if (msg.value == 0) revert ZeroAmount();
        positions[msg.sender].collateralWei += msg.value;
        emit CollateralAdded(msg.sender, msg.value);
    }

    /// @notice Partial or full repay. Pays banked interest first, then principal.
    function repay(uint256 amount) external nonReentrant {
        Position storage p = positions[msg.sender];
        if (p.debt == 0 && p.accruedInterest == 0) revert NoDebt();
        if (amount == 0) revert ZeroAmount();
        _accrue(p);

        uint256 owed = p.debt + p.accruedInterest;
        if (amount > owed) amount = owed;

        if (!stable.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();

        uint256 interestPaid = amount > p.accruedInterest ? p.accruedInterest : amount;
        p.accruedInterest -= interestPaid;
        uint256 principalPaid = amount - interestPaid;
        p.debt -= principalPaid;

        emit Repaid(msg.sender, amount, interestPaid, principalPaid, p.debt);
    }

    function withdrawCollateral(uint256 amountWei) external nonReentrant {
        Position storage p = positions[msg.sender];
        if (amountWei == 0) revert ZeroAmount();
        if (amountWei > p.collateralWei) revert ExceedsCollateral(amountWei, p.collateralWei);

        p.collateralWei -= amountWei;
        if (p.debt > 0) {
            uint256 need = _collateralFor(p.debt, scores.getCollateralBps(msg.sender));
            if (p.collateralWei < need) revert UnsafeWithdraw();
        }

        (bool ok,) = payable(msg.sender).call{value: amountWei}("");
        if (!ok) revert TransferFailed();
        emit CollateralWithdrawn(msg.sender, amountWei);
    }

    /// @notice Anyone may liquidate an undercollateralized position at the current tier.
    /// Seized collateral covers the debt and stays in the pool; excess refunds the borrower.
    function liquidate(address borrower) external nonReentrant {
        Position storage p = positions[borrower];
        if (p.debt == 0) revert NoDebt();
        _accrue(p);

        uint256 need = _collateralFor(p.debt, scores.getCollateralBps(borrower));
        if (p.collateralWei >= need) revert NotLiquidatable();

        uint256 owedWei = (p.debt + p.accruedInterest) * 1e12;
        uint256 seized = p.collateralWei > owedWei ? owedWei : p.collateralWei;
        uint256 refund = p.collateralWei - seized;

        delete positions[borrower];
        emit Liquidated(borrower, msg.sender, seized, refund);

        if (refund > 0) {
            (bool ok,) = payable(borrower).call{value: refund}("");
            if (!ok) revert TransferFailed();
        }
    }

    function seedStable(uint256 amount) external onlyOwner {
        if (!stable.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
    }

    function _accrue(Position storage p) private {
        if (p.debt == 0) {
            p.lastAccrual = uint64(block.timestamp);
            return;
        }
        uint256 elapsed = block.timestamp - p.lastAccrual;
        if (elapsed > 0) {
            p.accruedInterest += (p.debt * p.interestBps * elapsed) / (BPS * YEAR);
            p.lastAccrual = uint64(block.timestamp);
        }
    }

    function _pendingInterest(Position memory p) private view returns (uint256) {
        if (p.debt == 0 || block.timestamp <= p.lastAccrual) return 0;
        return (p.debt * p.interestBps * (block.timestamp - p.lastAccrual)) / (BPS * YEAR);
    }

    /// @dev 1 mUSDC (6 dec) = 1 CTC (18 dec). Fixed for the mock; no oracle.
    function _collateralFor(uint256 debtAmount, uint32 bps) internal pure returns (uint256) {
        return (debtAmount * 1e12 * bps) / BPS;
    }
}
