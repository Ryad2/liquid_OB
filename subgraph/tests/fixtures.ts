import { Address, BigInt, Bytes, ethereum } from '@graphprotocol/graph-ts'

export const AQUA = Address.fromString('0x00000000000000000000000000000000000000a0')
export const ROUTER = Address.fromString('0x00000000000000000000000000000000000000b0')
export const EXECUTOR = Address.fromString('0x00000000000000000000000000000000000000c0')
export const BASE = Address.fromString('0x1111111111111111111111111111111111111111')
export const QUOTE = Address.fromString('0x2222222222222222222222222222222222222222')
export const MAKER = Address.fromString('0x3333333333333333333333333333333333333333')
export const TAKER = Address.fromString('0x4444444444444444444444444444444444444444')

export function buildStrategy(): Bytes {
  const payload = new Bytes(269)
  payload[0] = 0x4c
  payload[1] = 0x4f
  payload[2] = 0x42
  payload[3] = 0x31
  payload[4] = 1
  copy(BASE, payload, 5)
  copy(QUOTE, payload, 25)
  for (let index = 45; index < 77; index += 1) payload[index] = 0xaa

  writeCurve(
    payload,
    77,
    BigInt.fromString('100000000000000000000'),
    BigInt.fromString('5000000000000000000'),
    BigInt.fromString('10000000000000000'),
  )
  writeCurve(
    payload,
    173,
    BigInt.fromString('99000000000000000000'),
    BigInt.fromString('500000000000000000000'),
    BigInt.fromString('99000000000000000000'),
  )

  const data = new Bytes(271)
  copy(payload, data, 0)
  data[269] = 0
  data[270] = 0
  const tuple = new ethereum.Tuple(3)
  tuple[0] = ethereum.Value.fromAddress(MAKER)
  tuple[1] = ethereum.Value.fromUnsignedBigInt(BigInt.zero())
  tuple[2] = ethereum.Value.fromBytes(data)
  return ethereum.encode(ethereum.Value.fromTuple(tuple))!
}

function writeCurve(
  payload: Bytes,
  offset: i32,
  price: BigInt,
  reserve: BigInt,
  kappa: BigInt,
): void {
  writeUint128(payload, offset, price)
  writeUint128(payload, offset + 16, price)
  writeUint128(payload, offset + 32, BigInt.zero())
  writeUint128(payload, offset + 48, reserve)
  writeUint128(payload, offset + 64, BigInt.zero())
  writeUint128(payload, offset + 80, kappa)
}

function writeUint128(target: Bytes, offset: i32, value: BigInt): void {
  let hex = value.toHexString()
  if ((hex.length - 2) % 2 != 0) hex = '0x0' + hex.slice(2)
  const source = Bytes.fromHexString(hex)
  for (let index = 0; index < source.length; index += 1) {
    target[offset + 16 - source.length + index] = source[index]
  }
}

function copy(source: Uint8Array, target: Uint8Array, offset: i32): void {
  for (let index = 0; index < source.length; index += 1) target[offset + index] = source[index]
}
