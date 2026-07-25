// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {AlphaWad, AmountWad, CurveConfig, CurveSide, PriceWad, RateWad, UnitlessWad} from "../types/CurveTypes.sol";
import {PositionConfig} from "../types/PositionTypes.sol";
import {
    LiquidOBEmptyPosition,
    LiquidOBIdenticalTokens,
    LiquidOBInvalidCurveCommitment,
    LiquidOBInvalidEncodingLength,
    LiquidOBInvalidEncodingMagic,
    LiquidOBInvalidEndpointOrder,
    LiquidOBNonCanonicalFlatCurve,
    LiquidOBUnsupportedAlpha,
    LiquidOBUnsupportedEncodingVersion,
    LiquidOBZeroAddress,
    LiquidOBZeroPrice
} from "../types/ProtocolErrors.sol";

/// @notice Canonical compact codec for immutable two-sided Liquid OB policy data.
/// @dev The payload is an instruction argument. The surrounding SwapVM opcode and
///      ABI-encoded `ISwapVM.Order` are separate layers and have separate hashes.
library PositionCodec {
    bytes4 internal constant MAGIC = 0x4c4f4231; // "LOB1"
    uint8 internal constant VERSION = 1;

    uint256 internal constant HEADER_LENGTH = 77;
    uint256 internal constant CURVE_LENGTH = 96;
    uint256 internal constant PAYLOAD_LENGTH = HEADER_LENGTH + (2 * CURVE_LENGTH);

    uint256 private constant BASE_TOKEN_OFFSET = 5;
    uint256 private constant QUOTE_TOKEN_OFFSET = 25;
    uint256 private constant SALT_OFFSET = 45;
    uint256 private constant SELL_OFFSET = HEADER_LENGTH;
    uint256 private constant BUY_OFFSET = HEADER_LENGTH + CURVE_LENGTH;

    bytes32 private constant MARKET_TYPEHASH = keccak256("LiquidOBMarket(address baseToken,address quoteToken)");
    bytes32 private constant POSITION_KEY_TYPEHASH =
        keccak256("LiquidOBPositionKey(address maker,bytes32 strategyHash)");
    bytes32 private constant POSITION_ID_TYPEHASH =
        keccak256("LiquidOBPositionId(uint256 chainId,address router,address maker,bytes32 strategyHash)");

    /// @notice Encodes a structurally valid immutable policy into 269 canonical bytes.
    function encode(PositionConfig memory config) internal pure returns (bytes memory payload) {
        validateStructure(config);

        payload = abi.encodePacked(
            MAGIC,
            VERSION,
            config.baseToken,
            config.quoteToken,
            config.salt,
            _encodeCurve(config.sell),
            _encodeCurve(config.buy)
        );

        assert(payload.length == PAYLOAD_LENGTH);
    }

    /// @notice Decodes and structurally validates one canonical payload.
    function decode(bytes calldata payload) internal pure returns (PositionConfig memory config) {
        if (payload.length != PAYLOAD_LENGTH) {
            revert LiquidOBInvalidEncodingLength(payload.length, PAYLOAD_LENGTH);
        }

        bytes4 actualMagic;
        assembly ("memory-safe") {
            actualMagic := calldataload(payload.offset)
        }
        if (actualMagic != MAGIC) revert LiquidOBInvalidEncodingMagic(actualMagic, MAGIC);

        uint8 actualVersion = uint8(payload[4]);
        if (actualVersion != VERSION) revert LiquidOBUnsupportedEncodingVersion(actualVersion, VERSION);

        config.baseToken = _readAddress(payload, BASE_TOKEN_OFFSET);
        config.quoteToken = _readAddress(payload, QUOTE_TOKEN_OFFSET);
        config.salt = _readBytes32(payload, SALT_OFFSET);
        config.sell = _decodeCurve(payload, SELL_OFFSET);
        config.buy = _decodeCurve(payload, BUY_OFFSET);
        validateStructure(config);
    }

    /// @notice Validates structural canonicality without proving mathematical commitments.
    /// @dev CurveCompiler and the execution instruction must additionally validate that
    ///      mu and kappa correspond to the displayed parameters and safe numerical domain.
    function validateStructure(PositionConfig memory config) internal pure {
        if (config.baseToken == address(0) || config.quoteToken == address(0)) revert LiquidOBZeroAddress();
        if (config.baseToken == config.quoteToken) revert LiquidOBIdenticalTokens(config.baseToken);

        _validateCurve(config.sell, CurveSide.Sell);
        _validateCurve(config.buy, CurveSide.Buy);

        if (AmountWad.unwrap(config.sell.initialReserve) == 0 && AmountWad.unwrap(config.buy.initialReserve) == 0) {
            revert LiquidOBEmptyPosition();
        }
    }

    /// @notice Returns the hash committed to the Liquid OB instruction payload.
    function hashPayload(bytes memory payload) internal pure returns (bytes32) {
        return _hashMemory(payload);
    }

    /// @notice Returns Aqua's hash for exact ABI-encoded SwapVM strategy bytes.
    function hashStrategy(bytes calldata strategy) internal pure returns (bytes32 result) {
        assembly ("memory-safe") {
            let pointer := mload(0x40)
            calldatacopy(pointer, strategy.offset, strategy.length)
            result := keccak256(pointer, strategy.length)
            mstore(0x40, and(add(add(pointer, strategy.length), 0x1f), not(0x1f)))
        }
    }

    /// @notice Returns the domain-separated ordered base/quote market identifier.
    function marketId(address baseToken, address quoteToken) internal pure returns (bytes32) {
        if (baseToken == address(0) || quoteToken == address(0)) revert LiquidOBZeroAddress();
        if (baseToken == quoteToken) revert LiquidOBIdenticalTokens(baseToken);
        return _hashMemory(abi.encode(MARKET_TYPEHASH, baseToken, quoteToken));
    }

    /// @notice Returns the router runtime key for a maker strategy.
    function positionKey(address maker, bytes32 strategyHash) internal pure returns (bytes32) {
        if (maker == address(0)) revert LiquidOBZeroAddress();
        return _hashMemory(abi.encode(POSITION_KEY_TYPEHASH, maker, strategyHash));
    }

    /// @notice Returns a portable identifier across chains and router deployments.
    function positionId(uint256 chainId, address router, address maker, bytes32 strategyHash)
        internal
        pure
        returns (bytes32)
    {
        if (router == address(0) || maker == address(0)) revert LiquidOBZeroAddress();
        return _hashMemory(abi.encode(POSITION_ID_TYPEHASH, chainId, router, maker, strategyHash));
    }

    function _encodeCurve(CurveConfig memory config) private pure returns (bytes memory) {
        return abi.encodePacked(
            PriceWad.unwrap(config.startPrice),
            PriceWad.unwrap(config.endPrice),
            AlphaWad.unwrap(config.alpha),
            AmountWad.unwrap(config.initialReserve),
            UnitlessWad.unwrap(config.mu),
            RateWad.unwrap(config.kappa)
        );
    }

    function _decodeCurve(bytes calldata payload, uint256 offset) private pure returns (CurveConfig memory config) {
        config.startPrice = PriceWad.wrap(_readUint128(payload, offset));
        config.endPrice = PriceWad.wrap(_readUint128(payload, offset + 16));
        config.alpha = AlphaWad.wrap(_readInt128(payload, offset + 32));
        config.initialReserve = AmountWad.wrap(_readUint128(payload, offset + 48));
        config.mu = UnitlessWad.wrap(_readUint128(payload, offset + 64));
        config.kappa = RateWad.wrap(_readUint128(payload, offset + 80));
    }

    function _validateCurve(CurveConfig memory config, CurveSide side) private pure {
        uint128 startPrice = PriceWad.unwrap(config.startPrice);
        uint128 endPrice = PriceWad.unwrap(config.endPrice);
        int128 alpha = AlphaWad.unwrap(config.alpha);
        uint128 mu = UnitlessWad.unwrap(config.mu);
        uint128 kappa = RateWad.unwrap(config.kappa);

        if (startPrice == 0 || endPrice == 0) revert LiquidOBZeroPrice(side);
        if (alpha == type(int128).min) revert LiquidOBUnsupportedAlpha(alpha);

        if (startPrice == endPrice) {
            if (alpha != 0 || mu != 0 || kappa == 0) revert LiquidOBNonCanonicalFlatCurve(side);
            return;
        }

        if (side == CurveSide.Sell ? startPrice > endPrice : startPrice < endPrice) {
            revert LiquidOBInvalidEndpointOrder(side, startPrice, endPrice);
        }
        if (mu == 0 || kappa == 0) revert LiquidOBInvalidCurveCommitment(side);
    }

    function _readAddress(bytes calldata payload, uint256 offset) private pure returns (address value) {
        assembly ("memory-safe") {
            value := shr(96, calldataload(add(payload.offset, offset)))
        }
    }

    function _readBytes32(bytes calldata payload, uint256 offset) private pure returns (bytes32 value) {
        assembly ("memory-safe") {
            value := calldataload(add(payload.offset, offset))
        }
    }

    function _readUint128(bytes calldata payload, uint256 offset) private pure returns (uint128 value) {
        assembly ("memory-safe") {
            value := shr(128, calldataload(add(payload.offset, offset)))
        }
    }

    function _readInt128(bytes calldata payload, uint256 offset) private pure returns (int128 value) {
        assembly ("memory-safe") {
            value := sar(128, calldataload(add(payload.offset, offset)))
        }
    }

    function _hashMemory(bytes memory data) private pure returns (bytes32 result) {
        assembly ("memory-safe") {
            result := keccak256(add(data, 0x20), mload(data))
        }
    }
}
