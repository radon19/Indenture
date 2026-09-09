// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {IOnChainCreditScore} from "./interfaces/IOnChainCreditScore.sol";

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address a) external view returns (uint256);
}

/// @notice CTC in, mockUSDC out. LTV + APR come from OnChainCreditScore.
contract MainLoanFacility {
    uint32 public constant BPS = 10_000;

    IOnChainCreditScore public immutable scores;
    IERC20 public immutable stable;
    address public owner;

    struct Position {
        uint256 collateralWei;
        uint256 debt;
        uint16 interestBps; // INTREST snapshot at last borrow
    }

    mapping(address => Position) public positions;

    event Borrowed(
        address indexed user,
        uint256 debt,
        uint256 collateralWei,
        uint32 collateralBps,
        uint16 interestBps
    );
    event Repaid(address indexed user, uint256 amount, uint256 debtLeft);
    event CollateralAdded(address indexed user, uint256 amount);
    event CollateralWithdrawn(address indexed user, uint256 amount);

    error NotOwner();
    error Zero();
    error NeedMoreCollateral(uint256 have, uint256 need);
    error NoDebt();
    error TransferFailed();
    error UnsafeWithdraw();

    constructor(address score_, address stable_) {
        scores = IOnChainCreditScore(score_);
        stable = IERC20(stable_);
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
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
        debt = p.debt;
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
        return (p.collateralWei, p.debt, p.interestBps);
    }

    function borrow(uint256 debtAmount) external payable {
        if (debtAmount == 0) revert Zero();

        uint32 colBps = scores.getCollateralBps(msg.sender);
        uint16 rateBps = scores.getInterestBps(msg.sender);

        Position storage p = positions[msg.sender];
        p.collateralWei += msg.value;
        p.debt += debtAmount;
        p.interestBps = rateBps;

        uint256 need = _collateralFor(p.debt, colBps);
        if (p.collateralWei < need) revert NeedMoreCollateral(p.collateralWei, need);

        if (!stable.transfer(msg.sender, debtAmount)) revert TransferFailed();
        emit Borrowed(msg.sender, p.debt, p.collateralWei, colBps, rateBps);
    }

    function addCollateral() external payable {
        if (msg.value == 0) revert Zero();
        positions[msg.sender].collateralWei += msg.value;
        emit CollateralAdded(msg.sender, msg.value);
    }

    function repay(uint256 amount) external {
        Position storage p = positions[msg.sender];
        if (p.debt == 0) revert NoDebt();
        if (amount == 0) revert Zero();
        if (amount > p.debt) amount = p.debt;

        if (!stable.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        p.debt -= amount;
        emit Repaid(msg.sender, amount, p.debt);
    }

    function withdrawCollateral(uint256 amountWei) external {
        Position storage p = positions[msg.sender];
        if (amountWei == 0 || amountWei > p.collateralWei) revert Zero();

        p.collateralWei -= amountWei;
        if (p.debt > 0) {
            uint256 need = _collateralFor(p.debt, scores.getCollateralBps(msg.sender));
            if (p.collateralWei < need) revert UnsafeWithdraw();
        }

        (bool ok,) = payable(msg.sender).call{value: amountWei}("");
        if (!ok) revert TransferFailed();
        emit CollateralWithdrawn(msg.sender, amountWei);
    }

    function seedStable(uint256 amount) external onlyOwner {
        if (!stable.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
    }

    function rescueCtc(uint256 amount) external onlyOwner {
        (bool ok,) = payable(owner).call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    /// @dev 1 mUSDC (6 dec) = 1 CTC (18 dec).
    function _collateralFor(uint256 debtAmount, uint32 bps) internal pure returns (uint256) {
        return (debtAmount * 1e12 * bps) / BPS;
    }

    receive() external payable {
        positions[msg.sender].collateralWei += msg.value;
        emit CollateralAdded(msg.sender, msg.value);
    }
}