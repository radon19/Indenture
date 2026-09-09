// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

/// @notice Amount → score delta. Bigger repay = more points, cap 50.
/// @dev Pass 18-decimal units (use `normalise` first).
library ScoreCalculateLib {
    uint16 internal constant MAX_POINTS = 50;
    uint256 internal constant DUST = 1e15; // 0.001 in 18 decimals

    function normalise(uint256 amount, uint8 decimals) internal pure returns (uint256) {
        if (decimals == 18) return amount;
        if (decimals < 18) return amount * (10 ** (18 - decimals));
        return amount / (10 ** (decimals - 18));
    }

    /// @notice Dust = 0. ≥ 1000 units = 50. Each extra ~10x money doubles points.
    function getPoints(uint256 amount18) internal pure returns (uint16) {
        if (amount18 < DUST) return 0;
        if (amount18 < 1e16) return 1;
        if (amount18 < 1e17) return 2;
        if (amount18 < 1e18) return 4;
        if (amount18 < 10e18) return 8;
        if (amount18 < 100e18) return 16;
        if (amount18 < 1_000e18) return 32;
        return MAX_POINTS;
    }

    function applyIncrease(uint16 current, uint16 maxScore, uint256 amount18)
        internal
        pure
        returns (uint16 newScore, uint16 gained)
    {
        gained = getPoints(amount18);
        if (gained == 0) return (current, 0);
        uint16 next = current + gained;
        if (next > maxScore || next < current) next = maxScore;
        return (next, gained);
    }
}