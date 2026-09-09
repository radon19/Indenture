// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {Test} from "forge-std/Test.sol";
import {OnChainCreditScore} from "../src/creditScore.sol";
import {EvmV1Decoder} from "../src/vendored/EvmV1Decoder.sol";
import {ScoreHarness, TxBuilder} from "./Harness.sol";

/// @notice End-to-end ingest: real decoder + scoring from synthetic receipts.
/// Every recognised log shape, every fail-loud guard, every ignore rule.
contract IngestTest is Test {
    ScoreHarness internal scores;
    address internal user = address(0xBEEF);
    address internal facility = address(0xFACADE);

    function setUp() public {
        scores = new ScoreHarness(facility);
    }

    function _ingest(bytes memory encoded, uint64 chainKey) internal {
        scores.exposedIngest(0, keccak256(encoded), chainKey, 21_000_000, encoded);
    }

    function _aaveRepayLog(address reserve, address who, uint256 amount)
        internal
        view
        returns (EvmV1Decoder.LogEntryTuple memory)
    {
        bytes32[] memory t = TxBuilder.topics4(
            scores.AAVE_REPAY(), TxBuilder.addrTopic(reserve), TxBuilder.addrTopic(who), TxBuilder.addrTopic(who)
        );
        return TxBuilder.log(scores.AAVE_V3_POOL(), t, abi.encode(amount, false));
    }

    function _ingestLogs(EvmV1Decoder.LogEntryTuple[] memory logs, uint64 chainKey) internal {
        _ingest(TxBuilder.encodeLogs(logs), chainKey);
    }

    function test_aaveRepay_scoresAndCaps() public {
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        logs[0] = _aaveRepayLog(scores.USDC(), user, 500e6);
        _ingestLogs(logs, 3);
        assertEq(scores.getScore(user), 632); // 600 + 32
        assertEq(scores.getCapacity(user), 500e18);
        assertEq(scores.getVenues(user), 1);
        assertEq(scores.getMaxRepayment(user), 500e18);
    }

    function test_dust_ignoredWithoutInit() public {
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        logs[0] = _aaveRepayLog(scores.USDC(), user, 100); // 100 * 1e12 = 1e14 < dust
        _ingestLogs(logs, 3);
        assertEq(scores.getScore(user), 600);
        assertFalse(scores.exposedIsInit(user));
        assertEq(scores.getCapacity(user), 0);
    }

    function test_unknownReserve_reverts() public {
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        logs[0] = _aaveRepayLog(address(0xC0FFEE), user, 1e18);
        vm.expectRevert(abi.encodeWithSelector(OnChainCreditScore.UnknownReserve.selector, address(0xC0FFEE)));
        _ingestLogs(logs, 3);
    }

    function test_missingPrice_reverts() public {
        address token = address(0xDEC1);
        scores.registerReserve(token, 18);
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        logs[0] = _aaveRepayLog(token, user, 1e18);
        vm.expectRevert(abi.encodeWithSelector(OnChainCreditScore.UnknownPrice.selector, token));
        _ingestLogs(logs, 3);
    }

    function test_flashPair_samePoolCoinUser_ignored() public {
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](2);
        logs[0] = _aaveRepayLog(scores.USDC(), user, 500e6);
        bytes32[] memory t = TxBuilder.topics4(
            scores.AAVE_BORROW(),
            TxBuilder.addrTopic(scores.USDC()),
            TxBuilder.addrTopic(user),
            TxBuilder.addrTopic(user)
        );
        logs[1] = TxBuilder.log(
            scores.AAVE_V3_POOL(), t, abi.encode(500e6, uint8(2), uint256(1e18), uint16(0))
        );
        _ingestLogs(logs, 3);
        assertEq(scores.getScore(user), 600);
        assertFalse(scores.exposedIsInit(user));
    }

    function test_honestRefinance_differentPool_scores() public {
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](2);
        logs[0] = _aaveRepayLog(scores.USDC(), user, 500e6);
        bytes32[] memory t = TxBuilder.topics4(
            scores.AAVE_BORROW(),
            TxBuilder.addrTopic(scores.WETH()),
            TxBuilder.addrTopic(user),
            TxBuilder.addrTopic(user)
        );
        // borrow shaped for SPARK pool, repay on AAVE pool -> no match
        logs[1] = TxBuilder.log(
            scores.SPARK_POOL(), t, abi.encode(1e18, uint8(2), uint256(1e18), uint16(0))
        );
        _ingestLogs(logs, 3);
        assertEq(scores.getScore(user), 632);
        assertEq(scores.getCapacity(user), 500e18);
    }

    function test_multiRepay_sameCoin_accumulates() public {
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](2);
        logs[0] = _aaveRepayLog(scores.USDC(), user, 100e6);
        logs[1] = _aaveRepayLog(scores.USDC(), user, 100e6);
        _ingestLogs(logs, 3);
        assertEq(scores.getCapacity(user), 200e18); // summed raw, one capacity add
        assertEq(scores.getMaxRepayment(user), 200e18);
    }

    function test_aaveLiquidation_smallStings() public {
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        bytes32[] memory t = TxBuilder.topics4(
            scores.AAVE_LIQ(),
            TxBuilder.addrTopic(scores.USDC()),
            TxBuilder.addrTopic(scores.USDC()),
            TxBuilder.addrTopic(user)
        );
        logs[0] = TxBuilder.log(scores.AAVE_V3_POOL(), t, abi.encode(10e6, 10e6));
        _ingestLogs(logs, 3);
        assertEq(scores.getScore(user), 580); // 600 - 20 small
        assertEq(scores.getDefaults(user), 1);
    }

    function test_compoundSupply_scores() public {
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        bytes32[] memory t = TxBuilder.topics3(
            scores.COMPOUND_SUPPLY(), TxBuilder.addrTopic(address(this)), TxBuilder.addrTopic(user)
        );
        logs[0] = TxBuilder.log(scores.COMET_USDC(), t, abi.encode(200e6));
        _ingestLogs(logs, 3);
        assertEq(scores.getScore(user), 632); // 200 USD -> 32
        assertEq(scores.getCapacity(user), 200e18);
        assertEq(scores.getVenues(user), 4);
    }

    function test_compoundWithdrawPlusSupply_ignored() public {
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](2);
        bytes32[] memory t0 = TxBuilder.topics3(
            scores.COMPOUND_SUPPLY(), TxBuilder.addrTopic(address(this)), TxBuilder.addrTopic(user)
        );
        logs[0] = TxBuilder.log(scores.COMET_USDC(), t0, abi.encode(200e6));
        bytes32[] memory t1 = TxBuilder.topics3(
            scores.COMPOUND_WITHDRAW(), TxBuilder.addrTopic(user), TxBuilder.addrTopic(user)
        );
        logs[1] = TxBuilder.log(scores.COMET_USDC(), t1, abi.encode(200e6));
        _ingestLogs(logs, 3);
        assertEq(scores.getScore(user), 600);
    }

    function test_compoundAbsorb_liquidates() public {
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        bytes32[] memory t = TxBuilder.topics4(
            scores.COMPOUND_ABSORB(),
            TxBuilder.addrTopic(address(this)),
            TxBuilder.addrTopic(user),
            TxBuilder.addrTopic(scores.USDC())
        );
        logs[0] = TxBuilder.log(scores.COMET_USDC(), t, abi.encode(5000e6, 5000e6));
        _ingestLogs(logs, 3);
        assertEq(scores.getScore(user), 480); // 600 - 120 large
        assertEq(scores.getDefaults(user), 1);
    }

    function test_facilityRepay_scoreOnly() public {
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        bytes32[] memory t = TxBuilder.topics3(
            scores.FACILITY_REPAY(), bytes32(uint256(7)), TxBuilder.addrTopic(user)
        );
        logs[0] = TxBuilder.log(facility, t, abi.encode(1 ether, uint256(0)));
        _ingestLogs(logs, 1);
        assertEq(scores.getScore(user), 608); // 1 ETH @ $1 -> +8
        assertEq(scores.getCapacity(user), 0); // mock builds no capacity
    }

    function test_facilityDefault_smallPenalty() public {
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        bytes32[] memory t = TxBuilder.topics3(
            scores.FACILITY_DEFAULT(), bytes32(uint256(7)), TxBuilder.addrTopic(user)
        );
        logs[0] = TxBuilder.log(facility, t, abi.encode(0.5 ether));
        _ingestLogs(logs, 1);
        assertEq(scores.getScore(user), 580);
        assertEq(scores.getDefaults(user), 1);
    }

    function test_paused_reverts() public {
        scores.pause();
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        logs[0] = _aaveRepayLog(scores.USDC(), user, 500e6);
        vm.expectRevert(OnChainCreditScore.EnforcedPause.selector);
        _ingestLogs(logs, 3);
        scores.unpause();
        _ingestLogs(logs, 3);
        assertEq(scores.getScore(user), 632);
    }

    function test_pause_onlyOwner() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(OnChainCreditScore.NotOwner.selector);
        scores.pause();
    }

    function test_unknownAction_reverts() public {
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        logs[0] = _aaveRepayLog(scores.USDC(), user, 500e6);
        bytes memory encoded = TxBuilder.encodeLogs(logs);
        vm.expectRevert(abi.encodeWithSelector(OnChainCreditScore.UnknownAction.selector, 1));
        scores.exposedIngest(1, keccak256(encoded), 3, 21_000_000, encoded);
    }

    function test_failedSourceTx_reverts() public {
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        logs[0] = _aaveRepayLog(scores.USDC(), user, 500e6);
        bytes memory encoded = TxBuilder.encodeFull(uint8(2), uint8(0), logs);
        vm.expectRevert(abi.encodeWithSelector(OnChainCreditScore.SourceTransactionFailed.selector, 0));
        scores.exposedIngest(0, keccak256(encoded), 3, 21_000_000, encoded);
    }

    function test_noRecognisedEvents_reverts() public {
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        bytes32[] memory t = new bytes32[](1);
        t[0] = keccak256("Nope()");
        logs[0] = TxBuilder.log(address(0xDEAD), t, bytes(""));
        vm.expectRevert(OnChainCreditScore.NoRecognisedEvents.selector);
        _ingestLogs(logs, 3);
    }

    function test_setPrice_guards() public {
        address usdc = scores.USDC();
        address weth = scores.WETH();
        uint256 maxPrice = scores.MAX_PRICE_USD18();
        vm.expectRevert(abi.encodeWithSelector(OnChainCreditScore.FixedPrice.selector, usdc));
        scores.setPrice(usdc, 2e18);
        vm.expectRevert(OnChainCreditScore.ZeroPrice.selector);
        scores.setPrice(weth, 0);
        vm.expectRevert(
            abi.encodeWithSelector(OnChainCreditScore.PriceTooHigh.selector, 2_000_000e18, maxPrice)
        );
        scores.setPrice(weth, 2_000_000e18);
        scores.setPrice(weth, 3000e18);
        assertEq(scores.priceUSD18(weth), 3000e18);
    }

    function test_anchor_guards() public {
        vm.expectRevert(OnChainCreditScore.InvalidAnchor.selector);
        scores.registerChainAnchor(3, 100, 0, 12);
        vm.expectRevert(OnChainCreditScore.InvalidAnchor.selector);
        scores.registerChainAnchor(3, 100, 1000, 0);
        vm.prank(address(0xBAD));
        vm.expectRevert(OnChainCreditScore.NotOwner.selector);
        scores.registerChainAnchor(3, 100, 1000, 12);
        scores.registerChainAnchor(3, 1_000_000, 1_700_000_000, 12);
        (uint64 h, uint64 t, uint32 s) = scores.chainAnchors(3);
        assertEq(h, 1_000_000);
        assertEq(t, 1_700_000_000);
        assertEq(s, 12);
    }

    function test_age_oldestWinsRegardlessOfOrder() public {
        scores.registerChainAnchor(3, 1_000_000, 1_700_000_000, 12);
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        logs[0] = _aaveRepayLog(scores.USDC(), user, 500e6);
        bytes memory encoded = TxBuilder.encodeLogs(logs);
        scores.exposedIngest(0, keccak256(abi.encode(1)), 3, 1_000_100, encoded);
        assertEq(scores.getOldestActivity(user), 1_700_000_000 + 1200);
        scores.exposedIngest(0, keccak256(abi.encode(2)), 3, 1_000_010, encoded);
        assertEq(scores.getOldestActivity(user), 1_700_000_000 + 120); // corrected downward
        scores.exposedIngest(0, keccak256(abi.encode(3)), 3, 1_000_500, encoded);
        assertEq(scores.getOldestActivity(user), 1_700_000_000 + 120); // newer never inflates
    }

    function test_age_fallsBackToNowWithoutAnchor() public {
        vm.warp(1_800_000_000);
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        logs[0] = _aaveRepayLog(scores.USDC(), user, 500e6);
        bytes memory encoded = TxBuilder.encodeLogs(logs);
        scores.exposedIngest(0, keccak256(encoded), 3, 5, encoded); // no anchor set
        assertEq(scores.getOldestActivity(user), 1_800_000_000);
    }

    function test_sameAssetRefinance_stillFlags() public {
        // Documented residual: same pool+coin+user pair is indistinguishable from flash.
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](2);
        logs[0] = _aaveRepayLog(scores.USDC(), user, 500e6);
        bytes32[] memory t = TxBuilder.topics4(
            scores.AAVE_BORROW(),
            TxBuilder.addrTopic(scores.USDC()),
            TxBuilder.addrTopic(user),
            TxBuilder.addrTopic(user)
        );
        logs[1] = TxBuilder.log(
            scores.AAVE_V3_POOL(), t, abi.encode(500e6, uint8(2), uint256(1e18), uint16(0))
        );
        _ingestLogs(logs, 3);
        assertEq(scores.getScore(user), 600);
    }

    function test_differentUserSamePool_scores() public {
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](2);
        logs[0] = _aaveRepayLog(scores.USDC(), user, 500e6);
        bytes32[] memory t = TxBuilder.topics4(
            scores.AAVE_BORROW(),
            TxBuilder.addrTopic(scores.USDC()),
            TxBuilder.addrTopic(address(0xB0B)),
            TxBuilder.addrTopic(address(0xB0B))
        );
        logs[1] = TxBuilder.log(
            scores.AAVE_V3_POOL(), t, abi.encode(500e6, uint8(2), uint256(1e18), uint16(0))
        );
        _ingestLogs(logs, 3);
        assertEq(scores.getScore(user), 632);
    }

    function test_malformedBorrow_reverts() public {
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        bytes32[] memory t = new bytes32[](1);
        t[0] = scores.AAVE_BORROW();
        logs[0] = TxBuilder.log(scores.AAVE_V3_POOL(), t, bytes(""));
        vm.expectRevert(OnChainCreditScore.ShortTopics.selector);
        _ingestLogs(logs, 3);
    }

    function test_absorbUnknownCollateral_reverts() public {
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        bytes32[] memory t = TxBuilder.topics4(
            scores.COMPOUND_ABSORB(),
            TxBuilder.addrTopic(address(this)),
            TxBuilder.addrTopic(user),
            TxBuilder.addrTopic(address(0xC01))
        );
        logs[0] = TxBuilder.log(scores.COMET_USDC(), t, abi.encode(100e6, 100e6));
        vm.expectRevert(abi.encodeWithSelector(OnChainCreditScore.UnknownReserve.selector, address(0xC01)));
        _ingestLogs(logs, 3);
    }

    function test_facilityPlusBorrow_noTorch() public {
        // Facility has no borrow events; a borrow-shaped log from an unregistered
        // emitter in the same receipt must not torch the genuine repayment.
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](2);
        bytes32[] memory t0 = TxBuilder.topics3(
            scores.FACILITY_REPAY(), bytes32(uint256(7)), TxBuilder.addrTopic(user)
        );
        logs[0] = TxBuilder.log(facility, t0, abi.encode(1 ether, uint256(0)));
        bytes32[] memory t1 = TxBuilder.topics4(
            scores.AAVE_BORROW(),
            TxBuilder.addrTopic(scores.USDC()),
            TxBuilder.addrTopic(user),
            TxBuilder.addrTopic(user)
        );
        logs[1] = TxBuilder.log(
            address(0xDEAD), t1, abi.encode(500e6, uint8(2), uint256(1e18), uint16(0))
        );
        _ingestLogs(logs, 1);
        assertEq(scores.getScore(user), 608);
    }
}
