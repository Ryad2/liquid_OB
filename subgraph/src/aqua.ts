import { Address, BigInt, Bytes, crypto, log } from '@graphprotocol/graph-ts'

import { Docked, Pulled, Pushed, Shipped } from '../generated/Aqua/Aqua'
import { CurveSide, Position } from '../generated/schema'
import {
  ONE,
  ZERO,
  deriveMarketId,
  derivePositionKey,
  isConfiguredApp,
  loadOrCreateMaker,
  loadOrCreateMarket,
  loadOrCreateProtocol,
  loadOrCreateToken,
  refreshAllocation,
  sideId,
} from './common'
import {
  DecodedCurve,
  alphaNative,
  betaNative,
  compiledBranch,
  decodeStrategy,
  pHigh,
  pLow,
} from './decoder'

export function handleShipped(event: Shipped): void {
  if (!isConfiguredApp(event.params.app)) return
  const decoded = decodeStrategy(event.params.strategy)
  if (decoded === null
    || !decoded.maker.equals(event.params.maker)
    || !Bytes.fromByteArray(crypto.keccak256(event.params.strategy)).equals(event.params.strategyHash)) {
    log.warning('Ignoring malformed Liquid OB strategy {}', [event.params.strategyHash.toHexString()])
    return
  }

  const positionKey = derivePositionKey(event.params.maker, event.params.strategyHash)
  const positionId = positionKey.toHexString()
  if (Position.load(positionId) !== null) return

  const baseToken = loadOrCreateToken(decoded.baseToken)
  const quoteToken = loadOrCreateToken(decoded.quoteToken)
  const marketId = deriveMarketId(decoded.baseToken, decoded.quoteToken)
  const market = loadOrCreateMarket(marketId, baseToken, quoteToken, event.block.number, event.block.timestamp)
  const maker = loadOrCreateMaker(event.params.maker, event.block.number)
  const protocol = loadOrCreateProtocol(event.block.number, event.block.timestamp)

  const position = new Position(positionId)
  position.positionKey = positionKey
  position.strategyHash = event.params.strategyHash
  position.policyHash = decoded.policyHash
  position.strategy = event.params.strategy
  position.maker = maker.id
  position.market = market.id
  position.baseToken = baseToken.id
  position.quoteToken = quoteToken.id
  position.salt = decoded.salt
  position.encodingVersion = 1
  position.active = true
  position.docked = false
  position.initialized = false
  position.runtimeVersion = ZERO
  position.baseAllocationRaw = ZERO
  position.quoteAllocationRaw = ZERO
  position.sufficientlyAllocated = false
  position.createdBlock = event.block.number
  position.createdTimestamp = event.block.timestamp
  position.createdTransaction = event.transaction.hash
  position.lastUpdateBlock = event.block.number
  position.lastUpdateTimestamp = event.block.timestamp
  position.lastUpdateTransaction = event.transaction.hash
  position.save()

  createSide(position, market.id, maker.id, baseToken.id, quoteToken.id, 'SELL', decoded.sell, event)
  createSide(position, market.id, maker.id, baseToken.id, quoteToken.id, 'BUY', decoded.buy, event)
  refreshAllocation(position)
  position.save()

  market.positionCount = market.positionCount.plus(ONE)
  market.activePositionCount = market.activePositionCount.plus(ONE)
  market.save()
  maker.positionCount = maker.positionCount.plus(ONE)
  maker.activePositionCount = maker.activePositionCount.plus(ONE)
  maker.save()
  protocol.positionCount = protocol.positionCount.plus(ONE)
  protocol.activePositionCount = protocol.activePositionCount.plus(ONE)
  protocol.save()
}

export function handlePushed(event: Pushed): void {
  applyAllocation(
    event.params.maker,
    event.params.app,
    event.params.strategyHash,
    event.params.token,
    event.params.amount,
    true,
    event.block.number,
    event.block.timestamp,
    event.transaction.hash,
  )
}

export function handlePulled(event: Pulled): void {
  applyAllocation(
    event.params.maker,
    event.params.app,
    event.params.strategyHash,
    event.params.token,
    event.params.amount,
    false,
    event.block.number,
    event.block.timestamp,
    event.transaction.hash,
  )
}

export function handleDocked(event: Docked): void {
  if (!isConfiguredApp(event.params.app)) return
  const key = derivePositionKey(event.params.maker, event.params.strategyHash)
  const position = Position.load(key.toHexString())
  if (position === null || !position.active) return

  position.active = false
  position.docked = true
  position.sufficientlyAllocated = false
  position.lastUpdateBlock = event.block.number
  position.lastUpdateTimestamp = event.block.timestamp
  position.lastUpdateTransaction = event.transaction.hash
  position.save()

  const sell = CurveSide.load(sideId(key, 'SELL'))
  const buy = CurveSide.load(sideId(key, 'BUY'))
  if (sell !== null) {
    sell.active = false
    sell.aquaAllocationRaw = ZERO
    sell.save()
  }
  if (buy !== null) {
    buy.active = false
    buy.aquaAllocationRaw = ZERO
    buy.save()
  }

  const market = loadOrCreateMarket(
    Bytes.fromHexString(position.market),
    loadOrCreateToken(Address.fromBytes(Bytes.fromHexString(position.baseToken))),
    loadOrCreateToken(Address.fromBytes(Bytes.fromHexString(position.quoteToken))),
    event.block.number,
    event.block.timestamp,
  )
  const maker = loadOrCreateMaker(event.params.maker, event.block.number)
  const protocol = loadOrCreateProtocol(event.block.number, event.block.timestamp)
  market.activePositionCount = market.activePositionCount.minus(ONE)
  market.save()
  maker.activePositionCount = maker.activePositionCount.minus(ONE)
  maker.save()
  protocol.activePositionCount = protocol.activePositionCount.minus(ONE)
  protocol.save()
}

function createSide(
  position: Position,
  marketId: string,
  makerId: string,
  baseTokenId: string,
  quoteTokenId: string,
  kind: string,
  curve: DecodedCurve,
  event: Shipped,
): void {
  const side = new CurveSide(sideId(position.positionKey, kind))
  side.position = position.id
  side.market = marketId
  side.maker = makerId
  side.side = kind
  side.branch = compiledBranch(curve, kind)
  side.tokenIn = kind == 'SELL' ? quoteTokenId : baseTokenId
  side.tokenOut = kind == 'SELL' ? baseTokenId : quoteTokenId
  side.startPriceWad = curve.startPrice
  side.endPriceWad = curve.endPrice
  side.alphaWad = curve.alpha
  side.alphaNativeWad = alphaNative(curve, kind)
  side.betaNativeWad = betaNative(curve, kind)
  side.pLowWad = pLow(curve, kind)
  side.pHighWad = pHigh(curve, kind)
  side.muWad = curve.mu
  side.kappaWad = curve.kappa
  side.initialReserveWad = curve.initialReserve
  side.yWad = curve.initialReserve
  side.yIntWad = curve.initialReserve
  side.currentPriceWad = curve.startPrice
  side.aquaAllocationRaw = ZERO
  side.active = curve.initialReserve.gt(ZERO)
  side.lastUpdateBlock = event.block.number
  side.lastUpdateTimestamp = event.block.timestamp
  side.lastUpdateTransaction = event.transaction.hash
  side.save()
}

function applyAllocation(
  makerAddress: Address,
  app: Address,
  strategyHash: Bytes,
  token: Address,
  amount: BigInt,
  increase: boolean,
  block: BigInt,
  timestamp: BigInt,
  transactionHash: Bytes,
): void {
  if (!isConfiguredApp(app)) return
  const key = derivePositionKey(makerAddress, strategyHash)
  const position = Position.load(key.toHexString())
  if (position === null) return

  const tokenId = token.toHexString().toLowerCase()
  if (tokenId == position.baseToken) {
    position.baseAllocationRaw = updateAmount(position.baseAllocationRaw, amount, increase)
  } else if (tokenId == position.quoteToken) {
    position.quoteAllocationRaw = updateAmount(position.quoteAllocationRaw, amount, increase)
  } else {
    return
  }

  position.lastUpdateBlock = block
  position.lastUpdateTimestamp = timestamp
  position.lastUpdateTransaction = transactionHash
  refreshAllocation(position)
  position.save()
  const protocol = loadOrCreateProtocol(block, timestamp)
  protocol.save()
}

function updateAmount(current: BigInt, amount: BigInt, increase: boolean): BigInt {
  if (increase) return current.plus(amount)
  return current.ge(amount) ? current.minus(amount) : ZERO
}
