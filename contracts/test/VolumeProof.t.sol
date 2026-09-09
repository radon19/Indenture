// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {Test} from "forge-std/Test.sol";
import {OnChainCreditScore} from "../src/creditScore.sol";
import {EvmV1Decoder} from "../src/vendored/EvmV1Decoder.sol";
import {ScoreHarness, TxBuilder} from "./Harness.sol";

/// @notice Volume run: 40 repayments + 5 liquidations across
/// Aave/Spark/Compound x USDC/USDT. Every case ingested as its own
/// transaction and recorded to proof.json as {txn, protocol, proofbody}.
contract VolumeProofTest is Test {
    ScoreHarness internal scores;
    address internal user = address(0xC0FFEE);

    string[] internal records;
    uint256 internal txn;

    // 6 combos cycled: 0-1 Aave, 2-3 Spark, 4-5 Compound, USDC/USDT alternating.
    function setUp() public {
        scores = new ScoreHarness(address(0xFACADE));
    }

    function _repayEmitter(uint256 i) internal view returns (address emitter, address token) {
        uint256 slot = i % 6;
        if (slot == 0) return (scores.AAVE_V3_POOL(), scores.USDC());
        if (slot == 1) return (scores.AAVE_V3_POOL(), scores.USDT());
        if (slot == 2) return (scores.SPARK_POOL(), scores.USDC());
        if (slot == 3) return (scores.SPARK_POOL(), scores.USDT());
        if (slot == 4) return (scores.COMET_USDC(), scores.USDC());
        return (scores.COMET_USDT(), scores.USDT());
    }

    function _isComet(address emitter) internal view returns (bool) {
        return emitter == scores.COMET_USDC() || emitter == scores.COMET_USDT();
    }

    function _repayLog(address emitter, address token, uint256 raw)
        internal
        view
        returns (EvmV1Decoder.LogEntryTuple memory)
    {
        if (_isComet(emitter)) {
            bytes32[] memory t =
                TxBuilder.topics3(scores.COMPOUND_SUPPLY(), TxBuilder.addrTopic(address(this)), TxBuilder.addrTopic(user));
            return TxBuilder.log(emitter, t, abi.encode(raw));
        }
        bytes32[] memory t = TxBuilder.topics4(
            scores.AAVE_REPAY(), TxBuilder.addrTopic(token), TxBuilder.addrTopic(user), TxBuilder.addrTopic(user)
        );
        return TxBuilder.log(emitter, t, abi.encode(raw, false));
    }

    function _submit(string memory protocol, EvmV1Decoder.LogEntryTuple memory entry) internal {
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        logs[0] = entry;
        bytes memory encoded = TxBuilder.encodeLogs(logs);
        scores.exposedIngest(0, keccak256(encoded), 3, 25_000_000, encoded);
        unchecked {
            ++txn;
        }
        records.push(
            string.concat(
                '{"txn":"', vm.toString(txn), '","protocol":"', protocol, '","proofbody":"', vm.toString(encoded), '"}'
            )
        );
    }

    function _protocolName(uint256 i) internal pure returns (string memory) {
        uint256 slot = i % 6;
        if (slot < 2) return "aave";
        if (slot < 4) return "spark";
        return "compound";
    }

    function test_volume_40Repays() public {
        uint256 sum;
        for (uint256 i; i < 40; ++i) {
            uint256 raw = (i + 1) * 25e6; // $25 .. $1000 in 6-dec units
            (address emitter, address token) = _repayEmitter(i);
            _submit(_protocolName(i), _repayLog(emitter, token, raw));
            sum += raw * 1e12;
        }
        assertEq(scores.getCapacity(user), sum); // 20,500 USD
        assertEq(scores.getMaxRepayment(user), 1000e18);
        assertEq(scores.getScore(user), 900); // points overflow the cap
        assertEq(scores.getVenues(user), 7); // AAVE|SPARK|COMP
        assertEq(uint8(scores.getTier(user)), uint8(OnChainCreditScore.Tier.Platinum));
    }

    function test_volume_5Liquidations() public {
        // {emitter-kind, debt/collateral token, raw} across brackets and venues
        _liqAave(scores.USDC(), 10e6); // $10  -> -20
        _liqAave(scores.USDT(), 200e6); // $200 -> -60
        _liqSpark(scores.USDC(), 5000e6); // $5000 -> -120
        _liqCompound(scores.USDC(), 30e6); // $30  -> -20
        _liqCompound(scores.USDT(), 800e6); // $800 -> -60
        assertEq(scores.getDefaults(user), 5);
        assertEq(scores.getScore(user), 400); // -280 hits the 400 floor after the large penalty
        assertEq(uint8(scores.getTier(user)), uint8(OnChainCreditScore.Tier.Bronze));
    }

    function _liqAave(address debt, uint256 raw) internal {
        _liqAaveLike(scores.AAVE_V3_POOL(), "aave", debt, raw);
    }

    function _liqSpark(address debt, uint256 raw) internal {
        _liqAaveLike(scores.SPARK_POOL(), "spark", debt, raw);
    }

    function _liqAaveLike(address pool, string memory protocol, address debt, uint256 raw) internal {
        bytes32[] memory t = TxBuilder.topics4(
            scores.AAVE_LIQ(), TxBuilder.addrTopic(scores.WETH()), TxBuilder.addrTopic(debt), TxBuilder.addrTopic(user)
        );
        _submit(protocol, TxBuilder.log(pool, t, abi.encode(raw, raw)));
    }

    function _liqCompound(address token, uint256 raw) internal {
        address comet = token == scores.USDC() ? scores.COMET_USDC() : scores.COMET_USDT();
        bytes32[] memory t = TxBuilder.topics4(
            scores.COMPOUND_ABSORB(),
            TxBuilder.addrTopic(address(this)),
            TxBuilder.addrTopic(user),
            TxBuilder.addrTopic(token)
        );
        _submit("compound", TxBuilder.log(comet, t, abi.encode(raw, raw)));
    }

    function test_volume_proofJson() public {
        for (uint256 i; i < 40; ++i) {
            uint256 raw = (i + 1) * 25e6;
            (address emitter, address token) = _repayEmitter(i);
            _submit(_protocolName(i), _repayLog(emitter, token, raw));
        }
        _liqAave(scores.USDC(), 10e6);
        _liqAave(scores.USDT(), 200e6);
        _liqSpark(scores.USDC(), 5000e6);
        _liqCompound(scores.USDC(), 30e6);
        _liqCompound(scores.USDT(), 800e6);
        assertEq(records.length, 45);
        assertEq(scores.getDefaults(user), 5);
        assertEq(uint8(scores.getTier(user)), uint8(OnChainCreditScore.Tier.Gold)); // defaults cap

        string memory json = "[";
        for (uint256 i; i < records.length; ++i) {
            json = string.concat(json, records[i]);
            if (i + 1 < records.length) json = string.concat(json, ",");
        }
        json = string.concat(json, "]");
        vm.writeFile("proof.json", json);
    }
}
