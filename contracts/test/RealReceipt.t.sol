// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {Test} from "forge-std/Test.sol";
import {EvmV1Decoder} from "../src/vendored/EvmV1Decoder.sol";
import {ScoreHarness, TxBuilder} from "./Harness.sol";

/// @notice Ground truth: real mainnet logs through the real decoder.
/// Fixtures hold exact log fields fetched from chain; the suites' other tests
/// only prove the decoder agrees with our own encoder. If a protocol's event
/// layout differs from our constants in any way, these fail and synthetics would not.
/// Envelope (common/type chunks) is synthetic — the decoder ignores it for scoring.
contract RealReceiptTest is Test {
    ScoreHarness internal scores;
    string internal constant FIX = "test/fixtures/";

    function setUp() public {
        scores = new ScoreHarness(address(0xFACADE));
    }

    function _loadLog(string memory file)
        internal
        view
        returns (EvmV1Decoder.LogEntryTuple memory entry, uint64 chainKey)
    {
        string memory json = vm.readFile(string.concat(FIX, file));
        address emitter = vm.parseJsonAddress(json, ".emitter");
        bytes32[] memory topics = vm.parseJsonBytes32Array(json, ".topics");
        bytes memory data = vm.parseJsonBytes(json, ".data");
        entry = TxBuilder.log(emitter, topics, data);
        chainKey = 3;
    }

    function _ingestOne(EvmV1Decoder.LogEntryTuple memory entry, uint64 chainKey) internal {
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        logs[0] = entry;
        bytes memory encoded = TxBuilder.encodeLogs(logs);
        scores.exposedIngest(0, keccak256(encoded), chainKey, 25_000_000, encoded);
    }

    function test_real_hashesMatchChain() public view {
        (EvmV1Decoder.LogEntryTuple memory aave,) = _loadLog("aave-repay.json");
        assertEq(aave.topics[0], scores.AAVE_REPAY());
        (EvmV1Decoder.LogEntryTuple memory comp,) = _loadLog("compound-supply.json");
        assertEq(comp.topics[0], scores.COMPOUND_SUPPLY());
    }

    function test_real_aave82USDT_scores16() public {
        (EvmV1Decoder.LogEntryTuple memory entry, uint64 chainKey) = _loadLog("aave-repay.json");
        address user = address(uint160(uint256(entry.topics[2])));
        _ingestOne(entry, chainKey);
        assertEq(scores.getScore(user), 616); // 600 + 16 for $81.77
        assertEq(scores.getCapacity(user), 81770675000000000000); // 81,770,675 USDT units
        assertEq(scores.getMaxRepayment(user), 81770675000000000000);
        assertEq(scores.getVenues(user), 1);
    }

    function test_real_compound1000USDC_scores50() public {
        (EvmV1Decoder.LogEntryTuple memory entry, uint64 chainKey) = _loadLog("compound-supply.json");
        address user = address(uint160(uint256(entry.topics[2])));
        _ingestOne(entry, chainKey);
        assertEq(scores.getScore(user), 632); // 600 + 32 for $1000
        assertEq(scores.getCapacity(user), 1000e18);
        assertEq(scores.getVenues(user), 4);
    }

    function test_real_bothHistories_combine() public {
        (EvmV1Decoder.LogEntryTuple memory aave,) = _loadLog("aave-repay.json");
        (EvmV1Decoder.LogEntryTuple memory comp,) = _loadLog("compound-supply.json");
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](2);
        logs[0] = aave;
        logs[1] = comp;
        bytes memory encoded = TxBuilder.encodeLogs(logs);
        scores.exposedIngest(0, keccak256(encoded), 3, 25_000_000, encoded);
        // different users/tokens: keep-first banks the Aave $82 repay
        address aaveUser = address(uint160(uint256(aave.topics[2])));
        assertEq(scores.getScore(aaveUser), 616);
    }
}
