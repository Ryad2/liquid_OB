import { BigInt, Bytes } from '@graphprotocol/graph-ts'

import { CurveFilled, PositionRuntimeInitialized } from '../generated/Router/Router'
import { CurveSide, Fill, Maker, Market, Position } from '../generated/schema'
import {
  ONE,
  ZERO,
  branchName,
  fillId,
  loadOrCreateMaker,
  loadOrCreateProtocol,
  loadOrCreateSnapshot,
  loadOrCreateToken,
  quoteKindName,
  refreshAllocation,
  sideId,
  sideName,
} from './common'

const ZERO_BYTES32 = Bytes.fromHexString('0x0000000000000000000000000000000000000000000000000000000000000000')

export function handlePositionRuntimeInitialized(event: PositionRuntimeInitialized): void {
  const position = Position.load(event.params.positionKey.toHexString())
  if (position === null) return
  const sell = CurveSide.load(sideId(event.params.positionKey, 'SELL'))
  const buy = CurveSide.load(sideId(event.params.positionKey, 'BUY'))
  if (sell === null || buy === null) return

  sell.yWad = event.params.sellY
  sell.yIntWad = event.params.sellYInt
  sell.active = position.active && event.params.sellY.gt(ZERO)
  touchSide(sell, event.block.number, event.block.timestamp, event.transaction.hash)
  buy.yWad = event.params.buyY
  buy.yIntWad = event.params.buyYInt
  buy.active = position.active && event.params.buyY.gt(ZERO)
  touchSide(buy, event.block.number, event.block.timestamp, event.transaction.hash)

  position.initialized = true
  position.runtimeVersion = event.params.version
  touchPosition(position, event.block.number, event.block.timestamp, event.transaction.hash)
  refreshAllocation(position)
  position.save()
}

export function handleCurveFilled(event: CurveFilled): void {
  const position = Position.load(event.params.positionKey.toHexString())
  if (position === null) return
  const market = Market.load(event.params.marketId.toHexString())
  if (market === null) return
  const maker = Maker.load(position.maker)
  if (maker === null) return
  const sell = CurveSide.load(sideId(event.params.positionKey, 'SELL'))
  const buy = CurveSide.load(sideId(event.params.positionKey, 'BUY'))
  if (sell === null || buy === null) return

  sell.yWad = event.params.sellYAfterWad
  sell.yIntWad = event.params.sellYIntAfterWad
  sell.active = position.active && sell.yWad.gt(ZERO)
  touchSide(sell, event.block.number, event.block.timestamp, event.transaction.hash)
  buy.yWad = event.params.buyYAfterWad
  buy.yIntWad = event.params.buyYIntAfterWad
  buy.active = position.active && buy.yWad.gt(ZERO)
  touchSide(buy, event.block.number, event.block.timestamp, event.transaction.hash)
  if (event.params.side == 0) sell.currentPriceWad = event.params.displayedPriceAfterWad
  else buy.currentPriceWad = event.params.displayedPriceAfterWad
  sell.save()
  buy.save()

  position.initialized = true
  position.runtimeVersion = event.params.versionAfter
  touchPosition(position, event.block.number, event.block.timestamp, event.transaction.hash)
  refreshAllocation(position)
  position.save()

  const tokenIn = loadOrCreateToken(event.params.tokenIn)
  const tokenOut = loadOrCreateToken(event.params.tokenOut)
  const routeId = event.params.routeId.toHexString()
  const fill = new Fill(fillId(event))
  if (!event.params.routeId.equals(ZERO_BYTES32)) fill.route = routeId
  fill.routeId = event.params.routeId
  fill.fillIndex = event.params.fillIndex
  fill.position = position.id
  fill.market = market.id
  fill.maker = maker.id
  fill.side = sideName(event.params.side)
  fill.branch = branchName(event.params.branch)
  fill.kind = quoteKindName(event.params.kind)
  fill.payer = event.params.payer
  fill.recipient = event.params.recipient
  fill.tokenIn = tokenIn.id
  fill.tokenOut = tokenOut.id
  fill.amountInRaw = event.params.amountIn
  fill.amountOutRaw = event.params.amountOut
  fill.nativeRateBeforeWad = event.params.nativeRateBeforeWad
  fill.nativeRateAfterWad = event.params.nativeRateAfterWad
  fill.nativeEffectiveRateWad = event.params.nativeEffectiveRateWad
  fill.displayedPriceBeforeWad = event.params.displayedPriceBeforeWad
  fill.displayedPriceAfterWad = event.params.displayedPriceAfterWad
  fill.displayedEffectivePriceWad = event.params.displayedEffectivePriceWad
  fill.versionBefore = event.params.versionBefore
  fill.versionAfter = event.params.versionAfter
  fill.blockNumber = event.block.number
  fill.timestamp = event.block.timestamp
  fill.transactionHash = event.transaction.hash
  fill.logIndex = event.logIndex
  fill.save()

  const baseVolume = event.params.side == 0 ? event.params.amountOut : event.params.amountIn
  const quoteVolume = event.params.side == 0 ? event.params.amountIn : event.params.amountOut
  market.fillCount = market.fillCount.plus(ONE)
  market.volumeBaseRaw = market.volumeBaseRaw.plus(baseVolume)
  market.volumeQuoteRaw = market.volumeQuoteRaw.plus(quoteVolume)
  market.lastUpdateBlock = event.block.number
  market.lastUpdateTimestamp = event.block.timestamp
  market.save()
  maker.fillCount = maker.fillCount.plus(ONE)
  maker.volumeBaseRaw = maker.volumeBaseRaw.plus(baseVolume)
  maker.volumeQuoteRaw = maker.volumeQuoteRaw.plus(quoteVolume)
  maker.lastUpdateBlock = event.block.number
  maker.save()

  const snapshot = loadOrCreateSnapshot(market, event.block.timestamp)
  snapshot.fillCount = snapshot.fillCount.plus(ONE)
  snapshot.volumeBaseRaw = snapshot.volumeBaseRaw.plus(baseVolume)
  snapshot.volumeQuoteRaw = snapshot.volumeQuoteRaw.plus(quoteVolume)
  snapshot.lastUpdateBlock = event.block.number
  snapshot.save()
  const protocol = loadOrCreateProtocol(event.block.number, event.block.timestamp)
  protocol.fillCount = protocol.fillCount.plus(ONE)
  protocol.save()
}

function touchSide(side: CurveSide, block: BigInt, timestamp: BigInt, transactionHash: Bytes): void {
  side.lastUpdateBlock = block
  side.lastUpdateTimestamp = timestamp
  side.lastUpdateTransaction = transactionHash
  side.save()
}

function touchPosition(position: Position, block: BigInt, timestamp: BigInt, transactionHash: Bytes): void {
  position.lastUpdateBlock = block
  position.lastUpdateTimestamp = timestamp
  position.lastUpdateTransaction = transactionHash
}
