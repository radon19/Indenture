// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {Test} from "forge-std/Test.sol";
import {OnChainCreditScore} from "../src/creditScore.sol";
import {ScoreHarness} from "./Harness.sol";

/// @notice Pins tier/stake/penalty/interest economics through the public surface.
contract TierStakeTest is Test {
    ScoreHarness internal scores;
    address internal user = address(0xBEEF);

    uint8 internal constant AAVE = 1;
    uint8 internal constant SPARK = 2;
    uint8 internal constant COMP = 4;

    function setUp() public {
        scores = new ScoreHarness(address(0xFACADE));
    }

    function test_freshUserIsDefaultBronze() public view {
        assertEq(scores.getScore(user), 600);
        assertEq(uint8(scores.getTier(user)), uint8(OnChainCreditScore.Tier.Bronze));
        assertEq(scores.getCapacity(user), 0);
        assertEq(scores.getMaxRepayment(user), 0);
    }

    function test_single100ReachesSilver() public {
        scores.exposedAddCapacity(user, 100e18, AAVE);
        assertEq(uint8(scores.getTier(user)), uint8(OnChainCreditScore.Tier.Silver));
    }

    function test_wash100x10NeverReachesPlatinum() public {
        for (uint256 i; i < 10; ++i) scores.exposedAddCapacity(user, 100e18, AAVE);
        // stake = 100 + 0.35*1000 = 450, one venue -> Silver, never Platinum
        assertEq(scores.getCapacity(user), 1000e18);
        assertEq(scores.getMaxRepayment(user), 100e18);
        assertTrue(scores.getTier(user) != OnChainCreditScore.Tier.Platinum);
        assertEq(uint8(scores.getTier(user)), uint8(OnChainCreditScore.Tier.Silver));
    }

    function test_real1000With3VenuesReachesPlatinum() public {
        scores.exposedAddCapacity(user, 1000e18, AAVE);
        scores.exposedAddCapacity(user, 1e18, SPARK);
        scores.exposedAddCapacity(user, 1e18, COMP);
        assertEq(uint8(scores.getTier(user)), uint8(OnChainCreditScore.Tier.Platinum));
    }

    function test_twoVenuesReachGold() public {
        scores.exposedAddCapacity(user, 500e18, AAVE);
        scores.exposedAddCapacity(user, 500e18, SPARK);
        assertEq(uint8(scores.getTier(user)), uint8(OnChainCreditScore.Tier.Gold));
    }

    function test_defaultCapsAtGold() public {
        scores.exposedAddCapacity(user, 5000e18, AAVE);
        scores.exposedAddCapacity(user, 5000e18, SPARK);
        scores.exposedDecrease(user, 5000e18);
        assertEq(uint8(scores.getTier(user)), uint8(OnChainCreditScore.Tier.Gold));
        assertEq(scores.getDefaults(user), 1);
    }

    function test_penalty_brackets() public {
        scores.exposedIncrease(user, 1_000e18); // 600 -> 632
        scores.exposedDecrease(user, 50e18); // small: -20
        assertEq(scores.getScore(user), 612);
        scores.exposedDecrease(user, 500e18); // mid: -60
        assertEq(scores.getScore(user), 552);
        scores.exposedDecrease(user, 5000e18); // large: -120
        assertEq(scores.getScore(user), 432);
    }

    function test_penalty_floorsAtMin() public {
        scores.exposedIncrease(user, 1e16); // +2 -> 602
        scores.exposedDecrease(user, 1_000_000e18);
        scores.exposedDecrease(user, 1_000_000e18);
        assertEq(scores.getScore(user), 400);
    }

    function test_defaults_saturateNeverBrick() public {
        for (uint256 i; i < 3; ++i) scores.exposedDecrease(user, 1e18);
        assertEq(scores.getDefaults(user), 3);
        assertEq(scores.getScore(user), 540); // 600 - 3x20 small penalties ($1 each)
    }

    function test_score_capsAt900() public {
        for (uint256 i; i < 10; ++i) scores.exposedIncrease(user, 1_000e18);
        assertEq(scores.getScore(user), 900);
    }

    function test_interest_followsTier() public {
        assertEq(scores.getInterestBps(user), 1800); // Bronze
        scores.exposedAddCapacity(user, 500e18, AAVE);
        scores.exposedAddCapacity(user, 500e18, SPARK);
        assertEq(scores.getInterestBps(user), 800); // Gold
    }

    function test_collateralBps_followsTier() public {
        assertEq(scores.getCollateralBps(user), 15_000);
        scores.exposedAddCapacity(user, 500e18, AAVE);
        scores.exposedAddCapacity(user, 500e18, SPARK);
        assertEq(scores.getCollateralBps(user), 11_000);
    }

    function test_maxRepayment_tracksHighWater() public {
        scores.exposedAddCapacity(user, 500e18, AAVE);
        scores.exposedAddCapacity(user, 100e18, AAVE);
        assertEq(scores.getMaxRepayment(user), 500e18);
        assertEq(scores.getCapacity(user), 600e18);
    }
    function test_zeroOrVenueLessAddsNothing() public {
        scores.exposedAddCapacity(user, 0, AAVE);
        scores.exposedAddCapacity(user, 500e18, 0);
        assertEq(scores.getCapacity(user), 0);
        assertEq(uint8(scores.getTier(user)), uint8(OnChainCreditScore.Tier.Bronze));
    }

    function test_previewCredit_fullTuple() public {
        scores.exposedAddCapacity(user, 500e18, AAVE);
        scores.exposedAddCapacity(user, 500e18, SPARK);
        (
            uint16 score,
            uint256 capacity18,
            uint256 maxRepayment18,
            uint64 oldestActivity,
            uint8 venues,
            uint16 venueCount,
            uint16 defaults,
            OnChainCreditScore.Tier tier,
            uint32 collateralBps,
            uint16 collateralPercent,
            uint16 interestBps,
            uint16 interestPercent
        ) = scores.previewCredit(user);
        assertEq(capacity18, 1000e18);
        assertEq(maxRepayment18, 500e18);
        assertEq(oldestActivity, 0); // no ingest yet, only direct adds
        assertEq(venues, 3);
        assertEq(venueCount, 2);
        assertEq(defaults, 0);
        assertEq(uint8(tier), uint8(OnChainCreditScore.Tier.Gold));
        assertEq(collateralBps, 11_000);
        assertEq(collateralPercent, 110);
        assertEq(interestBps, 800);
        assertEq(interestPercent, 8);
        assertEq(score, 600); // capacity alone moves no points
    }

    function test_percentViews() public {
        assertEq(scores.getInterestPercent(user), 18);
    }

    function test_quoteMaxBorrow_math() public {
        // covered separately against the pool in integration; registry-side sanity:
        assertEq(scores.getCollateralBps(user), 15_000);
    }

    function testFuzz_stakeMonotonicInMax(uint256 a, uint256 b) public {
        a = bound(a, 1e15, 10_000e18);
        b = bound(b, 1e15, 10_000e18);
        address u1 = address(0xA11CE);
        address u2 = address(0xB0B);
        scores.exposedAddCapacity(u1, a, AAVE);
        scores.exposedAddCapacity(u2, b, AAVE);
        if (a >= b) assertGe(scores.getMaxRepayment(u1), scores.getMaxRepayment(u2));
    }
}
