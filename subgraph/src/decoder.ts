import {
  Address,
  BigInt,
  ByteArray,
  Bytes,
  crypto,
  ethereum,
} from '@graphprotocol/graph-ts'

import { WAD } from './common'

const PAYLOAD_LENGTH = 269
const HEADER_LENGTH = 77
const CURVE_LENGTH = 96
const TWO_128 = BigInt.fromI32(2).pow(128)

export class DecodedCurve {
  startPrice: BigInt
  endPrice: BigInt
  alpha: BigInt
  initialReserve: BigInt
  mu: BigInt
  kappa: BigInt

  constructor(
    startPrice: BigInt,
    endPrice: BigInt,
    alpha: BigInt,
    initialReserve: BigInt,
    mu: BigInt,
    kappa: BigInt,
  ) {
    this.startPrice = startPrice
    this.endPrice = endPrice
    this.alpha = alpha
    this.initialReserve = initialReserve
    this.mu = mu
    this.kappa = kappa
  }
}

export class DecodedPosition {
  maker: Address
  baseToken: Address
  quoteToken: Address
  salt: Bytes
  payload: Bytes
  policyHash: Bytes
  sell: DecodedCurve
  buy: DecodedCurve

  constructor(
    maker: Address,
    baseToken: Address,
    quoteToken: Address,
    salt: Bytes,
    payload: Bytes,
    sell: DecodedCurve,
    buy: DecodedCurve,
  ) {
    this.maker = maker
    this.baseToken = baseToken
    this.quoteToken = quoteToken
    this.salt = salt
    this.payload = payload
    this.policyHash = Bytes.fromByteArray(crypto.keccak256(payload))
    this.sell = sell
    this.buy = buy
  }
}

export function decodeStrategy(strategy: Bytes): DecodedPosition | null {
  const decoded = ethereum.decode('(address,uint256,bytes)', strategy)
  if (decoded === null) return null
  const tuple = decoded.toTuple()
  if (tuple.length != 3) return null

  const data = tuple[2].toBytes()
  if (data.length < PAYLOAD_LENGTH) return null
  const payload = Bytes.fromUint8Array(data.subarray(0, PAYLOAD_LENGTH))
  if (payload[0] != 0x4c || payload[1] != 0x4f || payload[2] != 0x42 || payload[3] != 0x31) return null
  if (payload[4] != 1) return null

  const maker = tuple[0].toAddress()
  const baseToken = Address.fromBytes(Bytes.fromUint8Array(payload.subarray(5, 25)))
  const quoteToken = Address.fromBytes(Bytes.fromUint8Array(payload.subarray(25, 45)))
  const salt = Bytes.fromUint8Array(payload.subarray(45, 77))
  const sell = decodeCurve(payload, HEADER_LENGTH)
  const buy = decodeCurve(payload, HEADER_LENGTH + CURVE_LENGTH)
  return new DecodedPosition(maker, baseToken, quoteToken, salt, payload, sell, buy)
}

export function alphaNative(curve: DecodedCurve, side: string): BigInt {
  return side == 'SELL' ? curve.alpha.neg() : curve.alpha
}

export function betaNative(curve: DecodedCurve, side: string): BigInt {
  return alphaNative(curve, side).minus(WAD)
}

export function compiledBranch(curve: DecodedCurve, side: string): string {
  if (curve.startPrice.equals(curve.endPrice)) return 'FLAT'
  const native = alphaNative(curve, side)
  if (native.equals(BigInt.zero())) return 'NATIVE_ALPHA_ZERO'
  if (native.equals(WAD)) return 'NATIVE_ALPHA_ONE'
  return 'GENERAL'
}

export function pHigh(curve: DecodedCurve, side: string): BigInt {
  return side == 'BUY' ? curve.startPrice : WAD.times(WAD).div(curve.startPrice)
}

export function pLow(curve: DecodedCurve, side: string): BigInt {
  return side == 'BUY' ? curve.endPrice : WAD.times(WAD).div(curve.endPrice)
}

function decodeCurve(payload: Bytes, offset: i32): DecodedCurve {
  return new DecodedCurve(
    readUnsigned(payload, offset),
    readUnsigned(payload, offset + 16),
    readSigned(payload, offset + 32),
    readUnsigned(payload, offset + 48),
    readUnsigned(payload, offset + 64),
    readUnsigned(payload, offset + 80),
  )
}

function readUnsigned(payload: Bytes, offset: i32): BigInt {
  const littleEndian = new ByteArray(16)
  for (let index = 0; index < 16; index += 1) {
    littleEndian[index] = payload[offset + 15 - index]
  }
  return BigInt.fromUnsignedBytes(littleEndian)
}

function readSigned(payload: Bytes, offset: i32): BigInt {
  const unsigned = readUnsigned(payload, offset)
  return payload[offset] >= 0x80 ? unsigned.minus(TWO_128) : unsigned
}
