// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {
    AlphaWad,
    AmountWad,
    CurveBranch,
    CurveConfig,
    CurveSide,
    CurveTypesLib,
    PriceWad,
    RateWad,
    UnitlessWad
} from "../../src/types/CurveTypes.sol";
import {PositionConfig} from "../../src/types/PositionTypes.sol";
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
} from "../../src/types/ProtocolErrors.sol";
import {PositionCodec} from "../../src/libraries/PositionCodec.sol";

contract PositionCodecHarness {
    function encode(PositionConfig calldata config) external pure returns (bytes memory) {
        return PositionCodec.encode(config);
    }

    function decode(bytes calldata payload) external pure returns (PositionConfig memory) {
        return PositionCodec.decode(payload);
    }

    function validateStructure(PositionConfig calldata config) external pure {
        PositionCodec.validateStructure(config);
    }

    function hashPayload(bytes calldata payload) external pure returns (bytes32) {
        return PositionCodec.hashPayload(payload);
    }

    function hashStrategy(bytes calldata strategy) external pure returns (bytes32) {
        return PositionCodec.hashStrategy(strategy);
    }

    function marketId(address baseToken, address quoteToken) external pure returns (bytes32) {
        return PositionCodec.marketId(baseToken, quoteToken);
    }

    function positionKey(address maker, bytes32 strategyHash) external pure returns (bytes32) {
        return PositionCodec.positionKey(maker, strategyHash);
    }

    function positionId(uint256 chainId, address router, address maker, bytes32 strategyHash)
        external
        pure
        returns (bytes32)
    {
        return PositionCodec.positionId(chainId, router, maker, strategyHash);
    }

    function nativeAlphaWad(CurveConfig calldata config, CurveSide side) external pure returns (int256) {
        return CurveTypesLib.nativeAlphaWad(config, side);
    }

    function branch(CurveConfig calldata config, CurveSide side) external pure returns (CurveBranch) {
        return CurveTypesLib.branch(config, side);
    }

    function tokenIn(CurveSide side, address baseToken, address quoteToken) external pure returns (address) {
        return CurveTypesLib.tokenIn(side, baseToken, quoteToken);
    }

    function tokenOut(CurveSide side, address baseToken, address quoteToken) external pure returns (address) {
        return CurveTypesLib.tokenOut(side, baseToken, quoteToken);
    }
}

contract PositionCodecTest is Test {
    uint256 private constant WAD = 1e18;
    uint256 private constant EXPECTED_PAYLOAD_LENGTH = 269;
    bytes32 private constant EXPECTED_PAYLOAD_HASH = 0x545e5548b93c30a5c4aeefdd59d90941e754c725f5a8df1f212265055fe6ab07;

    address private constant BASE = 0x1111111111111111111111111111111111111111;
    address private constant QUOTE = 0x2222222222222222222222222222222222222222;
    address private constant MAKER = 0x3333333333333333333333333333333333333333;
    address private constant ROUTER = 0x4444444444444444444444444444444444444444;

    PositionCodecHarness private codec;

    function setUp() public {
        codec = new PositionCodecHarness();
    }

    function testEncodeDecodeRoundTripAndDeterministicHash() public view {
        PositionConfig memory expected = _position();
        bytes memory payload = codec.encode(expected);
        PositionConfig memory actual = codec.decode(payload);

        assertEq(payload.length, EXPECTED_PAYLOAD_LENGTH);
        assertEq(codec.hashPayload(payload), EXPECTED_PAYLOAD_HASH);
        _assertPositionEq(actual, expected);
    }

    function testSeparatesPayloadHashFromFullStrategyHash() public view {
        bytes memory payload = codec.encode(_position());
        bytes memory strategy = abi.encode(MAKER, uint256(7), bytes.concat(hex"99", payload, hex"00"));

        assertEq(codec.hashPayload(payload), keccak256(payload));
        assertEq(codec.hashStrategy(strategy), keccak256(strategy));
        assertTrue(codec.hashPayload(payload) != codec.hashStrategy(strategy));
    }

    function testDirectionAndSpecialBranchClassification() public view {
        PositionConfig memory config = _position();

        assertEq(codec.tokenIn(CurveSide.Sell, BASE, QUOTE), QUOTE);
        assertEq(codec.tokenOut(CurveSide.Sell, BASE, QUOTE), BASE);
        assertEq(codec.tokenIn(CurveSide.Buy, BASE, QUOTE), BASE);
        assertEq(codec.tokenOut(CurveSide.Buy, BASE, QUOTE), QUOTE);

        assertEq(codec.nativeAlphaWad(config.sell, CurveSide.Sell), -2e18);
        assertEq(codec.nativeAlphaWad(config.buy, CurveSide.Buy), -1e18);
        assertEq(uint8(codec.branch(config.sell, CurveSide.Sell)), uint8(CurveBranch.General));

        config.buy.alpha = AlphaWad.wrap(0);
        assertEq(uint8(codec.branch(config.buy, CurveSide.Buy)), uint8(CurveBranch.NativeAlphaZero));

        config.buy.alpha = AlphaWad.wrap(1e18);
        assertEq(uint8(codec.branch(config.buy, CurveSide.Buy)), uint8(CurveBranch.NativeAlphaOne));

        config.sell.alpha = AlphaWad.wrap(-1e18);
        assertEq(uint8(codec.branch(config.sell, CurveSide.Sell)), uint8(CurveBranch.NativeAlphaOne));

        config.sell.startPrice = PriceWad.wrap(100e18);
        config.sell.endPrice = PriceWad.wrap(100e18);
        assertEq(uint8(codec.branch(config.sell, CurveSide.Sell)), uint8(CurveBranch.Flat));
    }

    function testIdentifiersAreOrderedAndDomainSeparated() public view {
        bytes32 strategyHash = keccak256("strategy");
        bytes32 market = codec.marketId(BASE, QUOTE);
        bytes32 reverseMarket = codec.marketId(QUOTE, BASE);
        bytes32 key = codec.positionKey(MAKER, strategyHash);
        bytes32 portable = codec.positionId(8453, ROUTER, MAKER, strategyHash);

        assertTrue(market != reverseMarket);
        assertTrue(market != key);
        assertTrue(key != portable);
        assertEq(key, codec.positionKey(MAKER, strategyHash));
        assertTrue(portable != codec.positionId(8454, ROUTER, MAKER, strategyHash));
    }

    function testAllowsOneInitiallyEmptySide() public view {
        PositionConfig memory config = _position();
        config.buy.initialReserve = AmountWad.wrap(0);

        PositionConfig memory decoded = codec.decode(codec.encode(config));
        assertEq(AmountWad.unwrap(decoded.buy.initialReserve), 0);
        assertGt(AmountWad.unwrap(decoded.sell.initialReserve), 0);
    }

    function testCanonicalFlatCurveRoundTrips() public view {
        PositionConfig memory config = _position();
        config.sell.startPrice = PriceWad.wrap(100e18);
        config.sell.endPrice = PriceWad.wrap(100e18);
        config.sell.alpha = AlphaWad.wrap(0);
        config.sell.mu = UnitlessWad.wrap(0);
        config.sell.kappa = RateWad.wrap(0.01e18);

        PositionConfig memory decoded = codec.decode(codec.encode(config));
        assertEq(PriceWad.unwrap(decoded.sell.startPrice), 100e18);
        assertEq(AlphaWad.unwrap(decoded.sell.alpha), 0);
        assertEq(UnitlessWad.unwrap(decoded.sell.mu), 0);
    }

    function testRejectsWrongPayloadLength() public {
        bytes memory payload = new bytes(EXPECTED_PAYLOAD_LENGTH - 1);

        vm.expectRevert(
            abi.encodeWithSelector(
                LiquidOBInvalidEncodingLength.selector, EXPECTED_PAYLOAD_LENGTH - 1, EXPECTED_PAYLOAD_LENGTH
            )
        );
        codec.decode(payload);
    }

    function testRejectsWrongMagic() public {
        bytes memory payload = codec.encode(_position());
        payload[0] = 0x00;

        vm.expectRevert(
            abi.encodeWithSelector(LiquidOBInvalidEncodingMagic.selector, bytes4(0x004f4231), bytes4(0x4c4f4231))
        );
        codec.decode(payload);
    }

    function testRejectsUnsupportedVersion() public {
        bytes memory payload = codec.encode(_position());
        payload[4] = 0x02;

        vm.expectRevert(abi.encodeWithSelector(LiquidOBUnsupportedEncodingVersion.selector, 2, 1));
        codec.decode(payload);
    }

    function testRejectsZeroOrIdenticalTokens() public {
        PositionConfig memory config = _position();
        config.baseToken = address(0);

        vm.expectRevert(LiquidOBZeroAddress.selector);
        codec.encode(config);

        config.baseToken = BASE;
        config.quoteToken = BASE;
        vm.expectRevert(abi.encodeWithSelector(LiquidOBIdenticalTokens.selector, BASE));
        codec.encode(config);
    }

    function testRejectsZeroPrice() public {
        PositionConfig memory config = _position();
        config.sell.startPrice = PriceWad.wrap(0);

        vm.expectRevert(abi.encodeWithSelector(LiquidOBZeroPrice.selector, CurveSide.Sell));
        codec.encode(config);
    }

    function testDecodeRejectsStructurallyInvalidCalldata() public {
        bytes memory payload = codec.encode(_position());
        for (uint256 i = 77; i < 93; ++i) {
            payload[i] = 0;
        }

        vm.expectRevert(abi.encodeWithSelector(LiquidOBZeroPrice.selector, CurveSide.Sell));
        codec.decode(payload);
    }

    function testRejectsWrongEndpointOrdering() public {
        PositionConfig memory config = _position();
        config.sell.startPrice = PriceWad.wrap(201e18);

        vm.expectRevert(
            abi.encodeWithSelector(
                LiquidOBInvalidEndpointOrder.selector, CurveSide.Sell, uint128(201e18), uint128(200e18)
            )
        );
        codec.encode(config);

        config = _position();
        config.buy.startPrice = PriceWad.wrap(49e18);
        vm.expectRevert(
            abi.encodeWithSelector(LiquidOBInvalidEndpointOrder.selector, CurveSide.Buy, uint128(49e18), uint128(50e18))
        );
        codec.encode(config);
    }

    function testRejectsNonCanonicalFlatCurve() public {
        PositionConfig memory config = _position();
        config.sell.startPrice = PriceWad.wrap(100e18);
        config.sell.endPrice = PriceWad.wrap(100e18);

        vm.expectRevert(abi.encodeWithSelector(LiquidOBNonCanonicalFlatCurve.selector, CurveSide.Sell));
        codec.encode(config);
    }

    function testRejectsMissingNativeCommitment() public {
        PositionConfig memory config = _position();
        config.buy.mu = UnitlessWad.wrap(0);

        vm.expectRevert(abi.encodeWithSelector(LiquidOBInvalidCurveCommitment.selector, CurveSide.Buy));
        codec.encode(config);
    }

    function testRejectsBothSidesInitiallyEmpty() public {
        PositionConfig memory config = _position();
        config.sell.initialReserve = AmountWad.wrap(0);
        config.buy.initialReserve = AmountWad.wrap(0);

        vm.expectRevert(LiquidOBEmptyPosition.selector);
        codec.encode(config);
    }

    function testRejectsAsymmetricMinimumAlphaEncoding() public {
        PositionConfig memory config = _position();
        config.sell.alpha = AlphaWad.wrap(type(int128).min);

        vm.expectRevert(abi.encodeWithSelector(LiquidOBUnsupportedAlpha.selector, type(int128).min));
        codec.encode(config);
    }

    function _position() private pure returns (PositionConfig memory config) {
        config.baseToken = BASE;
        config.quoteToken = QUOTE;
        config.salt = keccak256("liquid-ob-phase-2-vector");
        config.sell = CurveConfig({
            startPrice: PriceWad.wrap(100e18),
            endPrice: PriceWad.wrap(200e18),
            alpha: AlphaWad.wrap(2e18),
            initialReserve: AmountWad.wrap(5e18),
            mu: UnitlessWad.wrap(0.75e18),
            kappa: RateWad.wrap(0.01e18)
        });
        config.buy = CurveConfig({
            startPrice: PriceWad.wrap(99e18),
            endPrice: PriceWad.wrap(50e18),
            alpha: AlphaWad.wrap(-1e18),
            initialReserve: AmountWad.wrap(5_000e18),
            mu: UnitlessWad.wrap(0.5e18),
            kappa: RateWad.wrap(50e18)
        });
    }

    function _assertPositionEq(PositionConfig memory actual, PositionConfig memory expected) private pure {
        assertEq(actual.baseToken, expected.baseToken);
        assertEq(actual.quoteToken, expected.quoteToken);
        assertEq(actual.salt, expected.salt);
        _assertCurveEq(actual.sell, expected.sell);
        _assertCurveEq(actual.buy, expected.buy);
    }

    function _assertCurveEq(CurveConfig memory actual, CurveConfig memory expected) private pure {
        assertEq(PriceWad.unwrap(actual.startPrice), PriceWad.unwrap(expected.startPrice));
        assertEq(PriceWad.unwrap(actual.endPrice), PriceWad.unwrap(expected.endPrice));
        assertEq(AlphaWad.unwrap(actual.alpha), AlphaWad.unwrap(expected.alpha));
        assertEq(AmountWad.unwrap(actual.initialReserve), AmountWad.unwrap(expected.initialReserve));
        assertEq(UnitlessWad.unwrap(actual.mu), UnitlessWad.unwrap(expected.mu));
        assertEq(RateWad.unwrap(actual.kappa), RateWad.unwrap(expected.kappa));
    }
}
