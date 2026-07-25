import {
  Address,
  BigInt,
  Bytes,
  DataSourceContext,
  crypto,
  ethereum,
} from '@graphprotocol/graph-ts'
import {
  afterEach,
  assert,
  clearStore,
  createMockedFunction,
  dataSourceMock,
  describe,
  newMockEvent,
  test,
} from 'matchstick-as/assembly/index'

import { Docked, Pulled, Pushed, Shipped } from '../generated/Aqua/Aqua'
import { RouteExecuted } from '../generated/BatchExecutor/BatchExecutor'
import { CurveFilled } from '../generated/Router/Router'
import { handleDocked, handlePulled, handlePushed, handleShipped } from '../src/aqua'
import { deriveMarketId, derivePositionKey, sideId } from '../src/common'
import { handleRouteExecuted } from '../src/executor'
import { handleCurveFilled } from '../src/router'
import { AQUA, BASE, EXECUTOR, MAKER, QUOTE, ROUTER, TAKER, buildStrategy } from './fixtures'

const ZERO = BigInt.zero()
const ONE_BASE = BigInt.fromString('1000000000000000000')
const FIVE_BASE = BigInt.fromString('5000000000000000000')
const HUNDRED_QUOTE = BigInt.fromString('100000000000000000000')
const FIVE_HUNDRED_QUOTE = BigInt.fromString('500000000000000000000')

afterEach(() => {
  clearStore()
  dataSourceMock.resetValues()
})

describe('native micro-pool lifecycle mappings', () => {
  test('indexes publish, allocation, recycle, route, and dock transitions', () => {
    configureAquaContext()
    mockToken(BASE, 'BASE')
    mockToken(QUOTE, 'QUOTE')
    const strategy = buildStrategy()
    const strategyHash = Bytes.fromByteArray(crypto.keccak256(strategy))
    const positionKey = derivePositionKey(MAKER, strategyHash)
    const marketId = deriveMarketId(BASE, QUOTE)
    const routeId = Bytes.fromHexString('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')

    handleShipped(shipped(strategyHash, strategy))
    assert.entityCount('Position', 1)
    assert.entityCount('CurveSide', 2)
    assert.fieldEquals('Position', positionKey.toHexString(), 'active', 'true')

    handlePushed(pushed(strategyHash, BASE, FIVE_BASE))
    handlePushed(pushed(strategyHash, QUOTE, FIVE_HUNDRED_QUOTE))
    assert.fieldEquals('Position', positionKey.toHexString(), 'sufficientlyAllocated', 'true')

    handleCurveFilled(curveFilled(routeId, positionKey, marketId, strategyHash))
    assert.fieldEquals('Position', positionKey.toHexString(), 'runtimeVersion', '1')
    assert.fieldEquals('CurveSide', sideId(positionKey, 'SELL'), 'yWad', '4000000000000000000')
    assert.fieldEquals('CurveSide', sideId(positionKey, 'BUY'), 'yWad', '600000000000000000000')
    assert.entityCount('Fill', 1)

    handlePulled(pulled(strategyHash, BASE, ONE_BASE))
    handlePushed(pushed(strategyHash, QUOTE, HUNDRED_QUOTE))
    assert.fieldEquals('Position', positionKey.toHexString(), 'sufficientlyAllocated', 'true')

    handleRouteExecuted(routeExecuted(routeId, marketId))
    assert.entityCount('Route', 1)
    assert.fieldEquals('Route', routeId.toHexString(), 'fillCount', '1')

    handleDocked(docked(strategyHash))
    assert.fieldEquals('Position', positionKey.toHexString(), 'active', 'false')
    assert.fieldEquals('Position', positionKey.toHexString(), 'docked', 'true')
    assert.fieldEquals('CurveSide', sideId(positionKey, 'SELL'), 'active', 'false')
  })
})

function configureAquaContext(): void {
  const context = new DataSourceContext()
  context.setBytes('router', ROUTER)
  dataSourceMock.setAddressAndContext(AQUA.toHexString(), context)
}

function mockToken(token: Address, symbol: string): void {
  createMockedFunction(token, 'symbol', 'symbol():(string)')
    .returns([ethereum.Value.fromString(symbol)])
  createMockedFunction(token, 'name', 'name():(string)')
    .returns([ethereum.Value.fromString(symbol + ' Token')])
  createMockedFunction(token, 'decimals', 'decimals():(uint8)')
    .returns([ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(18))])
}

function shipped(strategyHash: Bytes, strategy: Bytes): Shipped {
  const event = changetype<Shipped>(newMockEvent())
  event.address = AQUA
  event.parameters = [
    param('maker', ethereum.Value.fromAddress(MAKER)),
    param('app', ethereum.Value.fromAddress(ROUTER)),
    param('strategyHash', ethereum.Value.fromFixedBytes(strategyHash)),
    param('strategy', ethereum.Value.fromBytes(strategy)),
  ]
  return event
}

function pushed(strategyHash: Bytes, token: Address, amount: BigInt): Pushed {
  const event = changetype<Pushed>(newMockEvent())
  event.address = AQUA
  event.parameters = [
    param('maker', ethereum.Value.fromAddress(MAKER)),
    param('app', ethereum.Value.fromAddress(ROUTER)),
    param('strategyHash', ethereum.Value.fromFixedBytes(strategyHash)),
    param('token', ethereum.Value.fromAddress(token)),
    param('amount', ethereum.Value.fromUnsignedBigInt(amount)),
  ]
  return event
}

function pulled(strategyHash: Bytes, token: Address, amount: BigInt): Pulled {
  const event = changetype<Pulled>(pushed(strategyHash, token, amount))
  return event
}

function docked(strategyHash: Bytes): Docked {
  const event = changetype<Docked>(newMockEvent())
  event.address = AQUA
  event.parameters = [
    param('maker', ethereum.Value.fromAddress(MAKER)),
    param('app', ethereum.Value.fromAddress(ROUTER)),
    param('strategyHash', ethereum.Value.fromFixedBytes(strategyHash)),
  ]
  return event
}

function curveFilled(routeId: Bytes, positionKey: Bytes, marketId: Bytes, strategyHash: Bytes): CurveFilled {
  const event = changetype<CurveFilled>(newMockEvent())
  event.address = ROUTER
  event.parameters = [
    param('routeId', ethereum.Value.fromFixedBytes(routeId)),
    param('positionKey', ethereum.Value.fromFixedBytes(positionKey)),
    param('maker', ethereum.Value.fromAddress(MAKER)),
    param('marketId', ethereum.Value.fromFixedBytes(marketId)),
    param('strategyHash', ethereum.Value.fromFixedBytes(strategyHash)),
    uint('fillIndex', ZERO),
    uint('side', ZERO),
    uint('branch', BigInt.fromI32(3)),
    uint('kind', ZERO),
    param('payer', ethereum.Value.fromAddress(TAKER)),
    param('recipient', ethereum.Value.fromAddress(TAKER)),
    param('tokenIn', ethereum.Value.fromAddress(QUOTE)),
    param('tokenOut', ethereum.Value.fromAddress(BASE)),
    uint('amountIn', HUNDRED_QUOTE),
    uint('amountOut', ONE_BASE),
    uint('nativeRateBeforeWad', BigInt.fromString('10000000000000000')),
    uint('nativeRateAfterWad', BigInt.fromString('10000000000000000')),
    uint('nativeEffectiveRateWad', BigInt.fromString('10000000000000000')),
    uint('displayedPriceBeforeWad', BigInt.fromString('100000000000000000000')),
    uint('displayedPriceAfterWad', BigInt.fromString('100000000000000000000')),
    uint('displayedEffectivePriceWad', BigInt.fromString('100000000000000000000')),
    uint('sellYBeforeWad', FIVE_BASE),
    uint('sellYIntBeforeWad', FIVE_BASE),
    uint('buyYBeforeWad', FIVE_HUNDRED_QUOTE),
    uint('buyYIntBeforeWad', FIVE_HUNDRED_QUOTE),
    uint('versionBefore', ZERO),
    uint('sellYAfterWad', BigInt.fromString('4000000000000000000')),
    uint('sellYIntAfterWad', FIVE_BASE),
    uint('buyYAfterWad', BigInt.fromString('600000000000000000000')),
    uint('buyYIntAfterWad', BigInt.fromString('600000000000000000000')),
    uint('versionAfter', BigInt.fromI32(1)),
  ]
  return event
}

function routeExecuted(routeId: Bytes, marketId: Bytes): RouteExecuted {
  const event = changetype<RouteExecuted>(newMockEvent())
  event.address = EXECUTOR
  event.parameters = [
    param('routeId', ethereum.Value.fromFixedBytes(routeId)),
    param('marketId', ethereum.Value.fromFixedBytes(marketId)),
    param('payer', ethereum.Value.fromAddress(TAKER)),
    param('recipient', ethereum.Value.fromAddress(TAKER)),
    param('refundRecipient', ethereum.Value.fromAddress(TAKER)),
    uint('side', ZERO),
    uint('kind', ZERO),
    param('tokenIn', ethereum.Value.fromAddress(QUOTE)),
    param('tokenOut', ethereum.Value.fromAddress(BASE)),
    uint('amountIn', HUNDRED_QUOTE),
    uint('amountOut', ONE_BASE),
    uint('limit', ONE_BASE),
    uint('fillCount', BigInt.fromI32(1)),
  ]
  return event
}

function param(name: string, value: ethereum.Value): ethereum.EventParam {
  return new ethereum.EventParam(name, value)
}

function uint(name: string, value: BigInt): ethereum.EventParam {
  return param(name, ethereum.Value.fromUnsignedBigInt(value))
}
