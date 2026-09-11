// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {Test} from "forge-std/Test.sol";
import {OnChainCreditScore} from "../src/creditScore.sol";
import {EvmV1Decoder} from "../src/vendored/EvmV1Decoder.sol";
import {ScoreHarness, TxBuilder} from "./Harness.sol";

/// @notice Whole-receipt replay: every log of four real mainnet transactions,
/// junk and all, through the real decoder. Single-log tests prove agreement
/// with our encoder; these prove agreement with the chain.
contract WholeReceiptTest is Test {
    ScoreHarness internal scores;
    string internal constant FIX = "test/fixtures/receipts/";
    address internal constant GHO = 0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f;

    function setUp() public {
        scores = new ScoreHarness(address(0xFACADE));
    }

    function _loadReceipt(string memory file)
        internal
        view
        returns (EvmV1Decoder.LogEntryTuple[] memory logs, uint256 blockHeight)
    {
        string memory json = vm.readFile(string.concat(FIX, file));
        uint256 n = vm.parseJsonUint(json, ".count");
        logs = new EvmV1Decoder.LogEntryTuple[](n);
        for (uint256 i; i < n; ++i) {
            string memory base = string.concat(".logs[", vm.toString(i), "]");
            address emitter = vm.parseJsonAddress(json, string.concat(base, ".address"));
            bytes32[] memory topics = vm.parseJsonBytes32Array(json, string.concat(base, ".topics"));
            bytes memory data = vm.parseJsonBytes(json, string.concat(base, ".data"));
            logs[i] = TxBuilder.log(emitter, topics, data);
        }
        blockHeight = vm.parseJsonUint(json, ".blockNumber");
    }

    function test_whole_aaveRepayWithJunk() public {
        (EvmV1Decoder.LogEntryTuple[] memory logs, uint256 blk) = _loadReceipt("case1.json");
        assertEq(logs.length, 5);
        bytes memory encoded = TxBuilder.encodeLogs(logs);
        scores.exposedIngest(0, keccak256(encoded), 3, uint64(blk), encoded);
        address user = 0xE4Fd8213711F18Fad8A97A1DB45436Abd8a2902c;
        assertEq(scores.getScore(user), 616);
        assertEq(scores.getCapacity(user), 81770675000000000000);
        assertEq(scores.getVenues(user), 1);
    }

    function test_whole_compoundSupply() public {
        (EvmV1Decoder.LogEntryTuple[] memory logs, uint256 blk) = _loadReceipt("case2.json");
        assertEq(logs.length, 3);
        bytes memory encoded = TxBuilder.encodeLogs(logs);
        scores.exposedIngest(0, keccak256(encoded), 3, uint64(blk), encoded);
        address user = 0xbe26e03Dfb53BAeA3351757227cED5fb8eD5B605;
        assertEq(scores.getScore(user), 632);
        assertEq(scores.getCapacity(user), 1000e18);
        assertEq(scores.getVenues(user), 4);
    }

    function test_whole_unknownDebtCoinFailsLoud() public {
        (EvmV1Decoder.LogEntryTuple[] memory logs, uint256 blk) = _loadReceipt("case3.json");
        assertEq(logs.length, 41);
        bytes memory encoded = TxBuilder.encodeLogs(logs);
        vm.expectRevert(abi.encodeWithSelector(OnChainCreditScore.UnknownReserve.selector, GHO));
        scores.exposedIngest(0, keccak256(encoded), 3, uint64(blk), encoded);
    }

    function test_whole_ghoLiquidationAfterOnboarding() public {
        scores.registerReserve(GHO, 18);
        scores.setPrice(GHO, 2724250000000000000000); // $2724.25 live
        (EvmV1Decoder.LogEntryTuple[] memory logs, uint256 blk) = _loadReceipt("case3.json");
        bytes memory encoded = TxBuilder.encodeLogs(logs);
        scores.exposedIngest(0, keccak256(encoded), 3, uint64(blk), encoded);
        address user = 0x52aD04141bCbF74A3834EeFBcB75A2Ae613d75dE;
        assertEq(scores.getScore(user), 480); // ~$449k -> large -120
        assertEq(scores.getDefaults(user), 1);
    }

    function test_whole_sparkDustLiquidation338Logs() public {
        (EvmV1Decoder.LogEntryTuple[] memory logs, uint256 blk) = _loadReceipt("case4.json");
        assertEq(logs.length, 338);
        bytes memory encoded = TxBuilder.encodeLogs(logs);
        scores.exposedIngest(0, keccak256(encoded), 3, uint64(blk), encoded);
        address user = 0xA01d1C65A61a0560591e8ec3eE7cE377b491F940;
        assertEq(scores.getScore(user), 580); // $0.44 -> small -20
        assertEq(scores.getDefaults(user), 1);
        assertEq(uint8(scores.getTier(user)), uint8(OnChainCreditScore.Tier.Bronze));
    }
}
