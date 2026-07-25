import {
  Address,
  BigInt,
  ByteArray,
  Bytes,
  crypto,
  dataSource,
  ethereum,
} from '@graphprotocol/graph-ts'

import { ERC20 } from '../generated/Aqua/ERC20'
import {
  CurveSide,
  Maker,
  Market,
  MarketSnapshot,
  Position,
  Protocol,
  Token,
} from '../generated/schema'

export const ZERO = BigInt.zero()
export const ONE = BigInt.fromI32(1)
export const WAD = BigInt.fromString('1000000000000000000')
const DAY_SECONDS = BigInt.fromI32(86_400)
const MARKET_TYPE = 'LiquidOBMarket(address baseToken,address quoteToken)'
const POSITION_KEY_TYPE = 'LiquidOBPositionKey(address maker,bytes32 strategyHash)'

export function configuredRouter(): Address {
  return Address.fromBytes(dataSource.context().getBytes('router'))
}

export function isConfiguredApp(app: Address): boolean {
  return app.equals(configuredRouter())
}

export function deriveMarketId(baseToken: Address, quoteToken: Address): Bytes {
  const encoded = new Uint8Array(96)
  copy(crypto.keccak256(ByteArray.fromUTF8(MARKET_TYPE)), encoded, 0)
  copy(baseToken, encoded, 44)
  copy(quoteToken, encoded, 76)
  return Bytes.fromByteArray(crypto.keccak256(Bytes.fromUint8Array(encoded)))
}

export function derivePositionKey(maker: Address, strategyHash: Bytes): Bytes {
  const encoded = new Uint8Array(96)
  copy(crypto.keccak256(ByteArray.fromUTF8(POSITION_KEY_TYPE)), encoded, 0)
  copy(maker, encoded, 44)
  copy(strategyHash, encoded, 64)
  return Bytes.fromByteArray(crypto.keccak256(Bytes.fromUint8Array(encoded)))
}

export function sideId(positionKey: Bytes, side: string): string {
  return positionKey.toHexString() + '-' + side.toLowerCase()
}

export function fillId(event: ethereum.Event): string {
  return event.transaction.hash.toHexString() + '-' + event.logIndex.toString()
}

export function loadOrCreateProtocol(block: BigInt, timestamp: BigInt): Protocol {
  let protocol = Protocol.load('liquid-ob')
  if (protocol === null) {
    protocol = new Protocol('liquid-ob')
    protocol.positionCount = ZERO
    protocol.activePositionCount = ZERO
    protocol.fillCount = ZERO
    protocol.routeCount = ZERO
  }
  protocol.lastUpdateBlock = block
  protocol.lastUpdateTimestamp = timestamp
  return protocol
}

export function loadOrCreateToken(address: Address): Token {
  const id = address.toHexString().toLowerCase()
  let token = Token.load(id)
  if (token !== null) return token

  const contract = ERC20.bind(address)
  const symbol = contract.try_symbol()
  const name = contract.try_name()
  const decimals = contract.try_decimals()
  token = new Token(id)
  token.address = address
  token.symbol = symbol.reverted ? id.slice(0, 8) : symbol.value
  token.name = name.reverted ? token.symbol : name.value
  token.decimals = decimals.reverted ? 18 : decimals.value
  token.save()
  return token
}

export function loadOrCreateMarket(
  marketId: Bytes,
  baseToken: Token,
  quoteToken: Token,
  block: BigInt,
  timestamp: BigInt,
): Market {
  const id = marketId.toHexString()
  let market = Market.load(id)
  if (market === null) {
    market = new Market(id)
    market.marketId = marketId
    market.baseToken = baseToken.id
    market.quoteToken = quoteToken.id
    market.positionCount = ZERO
    market.activePositionCount = ZERO
    market.fillCount = ZERO
    market.routeCount = ZERO
    market.volumeBaseRaw = ZERO
    market.volumeQuoteRaw = ZERO
  }
  market.lastUpdateBlock = block
  market.lastUpdateTimestamp = timestamp
  return market
}

export function loadOrCreateMaker(address: Address, block: BigInt): Maker {
  const id = address.toHexString().toLowerCase()
  let maker = Maker.load(id)
  if (maker === null) {
    maker = new Maker(id)
    maker.address = address
    maker.positionCount = ZERO
    maker.activePositionCount = ZERO
    maker.fillCount = ZERO
    maker.volumeBaseRaw = ZERO
    maker.volumeQuoteRaw = ZERO
  }
  maker.lastUpdateBlock = block
  return maker
}

export function loadOrCreateSnapshot(market: Market, timestamp: BigInt): MarketSnapshot {
  const day = timestamp.div(DAY_SECONDS).toI32()
  const id = market.id + '-' + day.toString()
  let snapshot = MarketSnapshot.load(id)
  if (snapshot === null) {
    snapshot = new MarketSnapshot(id)
    snapshot.market = market.id
    snapshot.day = day
    snapshot.fillCount = ZERO
    snapshot.routeCount = ZERO
    snapshot.volumeBaseRaw = ZERO
    snapshot.volumeQuoteRaw = ZERO
    snapshot.lastUpdateBlock = ZERO
  }
  return snapshot
}

export function refreshAllocation(position: Position): void {
  const baseToken = Token.load(position.baseToken)
  const quoteToken = Token.load(position.quoteToken)
  const sell = CurveSide.load(sideId(position.positionKey, 'SELL'))
  const buy = CurveSide.load(sideId(position.positionKey, 'BUY'))
  if (baseToken === null || quoteToken === null || sell === null || buy === null) return

  sell.aquaAllocationRaw = position.baseAllocationRaw
  buy.aquaAllocationRaw = position.quoteAllocationRaw
  sell.save()
  buy.save()
  position.sufficientlyAllocated = rawToWad(position.baseAllocationRaw, baseToken.decimals).ge(sell.yWad)
    && rawToWad(position.quoteAllocationRaw, quoteToken.decimals).ge(buy.yWad)
}

export function rawToWad(amount: BigInt, decimals: i32): BigInt {
  if (decimals == 18) return amount
  const ten = BigInt.fromI32(10)
  if (decimals < 18) return amount.times(ten.pow((18 - decimals) as u8))
  return amount.div(ten.pow((decimals - 18) as u8))
}

export function branchName(value: i32): string {
  if (value == 1) return 'NATIVE_ALPHA_ZERO'
  if (value == 2) return 'NATIVE_ALPHA_ONE'
  if (value == 3) return 'FLAT'
  return 'GENERAL'
}

export function sideName(value: i32): string {
  return value == 0 ? 'SELL' : 'BUY'
}

export function quoteKindName(value: i32): string {
  return value == 0 ? 'EXACT_INPUT' : 'EXACT_OUTPUT'
}

function copy(source: Uint8Array, target: Uint8Array, offset: i32): void {
  for (let index = 0; index < source.length; index += 1) {
    target[offset + index] = source[index]
  }
}
