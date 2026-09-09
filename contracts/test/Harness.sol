// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {OnChainCreditScore} from "../src/creditScore.sol";
import {EvmV1Decoder} from "../src/vendored/EvmV1Decoder.sol";

/// @notice Exposes creditScore internals so tests can drive scoring without the
/// block-prover precompile (0xFD2 does not exist outside Creditcoin).
contract ScoreHarness is OnChainCreditScore {
    constructor(address facility) OnChainCreditScore(facility) {}

    function exposedIngest(
        uint8 action,
        bytes32 queryId,
        uint64 chainKey,
        uint64 blockHeight,
        bytes memory encodedTransaction
    ) external {
        _processAndEmitEvent(action, queryId, chainKey, blockHeight, encodedTransaction);
    }

    function exposedAddCapacity(address user, uint256 amount18, uint8 bit) external {
        _addCapacity(user, amount18, bit);
    }

    function exposedIncrease(address user, uint256 amount18) external {
        increaseScore(user, amount18);
    }

    function exposedDecrease(address user, uint256 severity18) external {
        decreaseScore(user, severity18);
    }

    function exposedValue(address token, uint256 raw) external view returns (uint256) {
        return _value18(token, raw);
    }

    function exposedIsInit(address user) external view returns (bool) {
        return _profiles[user].isInitialized;
    }
}

/// @notice Builds minimal EvmV1Decoder type-2 payloads carrying one receipt.
/// Shape: abi.encode(uint8(2), [common, type2, receipt]).
library TxBuilder {
    function encodeLogs(EvmV1Decoder.LogEntryTuple[] memory logs) internal pure returns (bytes memory) {
        return encodeFull(uint8(2), uint8(1), logs);
    }

    function encodeFull(uint8 ty, uint8 status, EvmV1Decoder.LogEntryTuple[] memory logs)
        internal
        pure
        returns (bytes memory)
    {
        bytes[] memory chunks = new bytes[](3);
        chunks[0] = abi.encode(uint64(1), uint64(21000), address(1), false, address(2), uint256(0), bytes(""));
        EvmV1Decoder.AccessListEntryBytes32[] memory al = new EvmV1Decoder.AccessListEntryBytes32[](0);
        chunks[1] = abi.encode(uint64(1), uint128(1), uint128(2), al, uint8(0), bytes32(0), bytes32(0));
        chunks[2] = abi.encode(status, uint64(21000), logs, bytes(""));
        return abi.encode(ty, chunks);
    }

    function log(address emitter, bytes32[] memory topics, bytes memory data)
        internal
        pure
        returns (EvmV1Decoder.LogEntryTuple memory)
    {
        return EvmV1Decoder.LogEntryTuple({address_: emitter, topics: topics, data: data});
    }

    function topics3(bytes32 sig, bytes32 t1, bytes32 t2) internal pure returns (bytes32[] memory) {
        bytes32[] memory t = new bytes32[](3);
        t[0] = sig;
        t[1] = t1;
        t[2] = t2;
        return t;
    }

    function topics4(bytes32 sig, bytes32 t1, bytes32 t2, bytes32 t3) internal pure returns (bytes32[] memory) {
        bytes32[] memory t = new bytes32[](4);
        t[0] = sig;
        t[1] = t1;
        t[2] = t2;
        t[3] = t3;
        return t;
    }

    function addrTopic(address a) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(a)));
    }
}
