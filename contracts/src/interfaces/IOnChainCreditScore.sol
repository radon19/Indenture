// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

interface IOnChainCreditScore {
    enum Tier { Bronze, Silver, Gold, Platinum }

    function getScore(address user) external view returns (uint16);
    function getCapacity(address user) external view returns (uint256);
    function getVenues(address user) external view returns (uint8);
    function getDefaults(address user) external view returns (uint16);
    function getTier(address user) external view returns (Tier);
    function getCollateralBps(address user) external view returns (uint32);
    function getInterestBps(address user) external view returns (uint16);
    function getInterestPercent(address user) external view returns (uint16);
}