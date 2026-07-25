import {
  concatHex,
  encodeAbiParameters,
  isAddress,
  keccak256,
  size,
  toHex,
  type Address,
  type Hex,
} from 'viem'

import type { CompiledCurve, PositionConfig, PositionStrategy, SwapVmOrder } from './types.js'

export const POSITION_MAGIC = '0x4c4f4231' as const
export const POSITION_ENCODING_VERSION = 1
export const POSITION_PAYLOAD_LENGTH = 269
const UINT128_MAX = (1n << 128n) - 1n
const INT128_MIN = -(1n << 127n)
const INT128_MAX = (1n << 127n) - 1n
const USE_AQUA_TRAIT = 1n << 254n
const PROGRAM_OFFSET_SHIFT = 208n

export function encodePositionPayload(config: PositionConfig): Hex {
  if (!isAddress(config.baseToken) || !isAddress(config.quoteToken)) throw new Error('Invalid token address')
  if (size(config.salt) !== 32) throw new Error('Salt must be bytes32')

  const payload = concatHex([
    POSITION_MAGIC,
    toHex(POSITION_ENCODING_VERSION, { size: 1 }),
    config.baseToken,
    config.quoteToken,
    config.salt,
    encodeCurve(config.sell),
    encodeCurve(config.buy),
  ])
  if (size(payload) !== POSITION_PAYLOAD_LENGTH) throw new Error('Unexpected position payload length')
  return payload
}

export function buildPositionStrategy(
  config: PositionConfig,
  maker: Address,
  liquidCurveOpcode: number,
): PositionStrategy {
  if (!isAddress(maker)) throw new Error('Invalid maker address')
  if (!Number.isInteger(liquidCurveOpcode) || liquidCurveOpcode < 0 || liquidCurveOpcode > 255) {
    throw new Error('Opcode must fit uint8')
  }

  const payload = encodePositionPayload(config)
  const program = concatHex([toHex(liquidCurveOpcode, { size: 1 }), '0x00'])
  const order: SwapVmOrder = {
    maker,
    traits: USE_AQUA_TRAIT | (BigInt(POSITION_PAYLOAD_LENGTH) << PROGRAM_OFFSET_SHIFT),
    data: concatHex([payload, program]),
  }
  const encodedOrder = encodeAbiParameters(
    [{
      type: 'tuple',
      components: [
        { name: 'maker', type: 'address' },
        { name: 'traits', type: 'uint256' },
        { name: 'data', type: 'bytes' },
      ],
    }],
    [order],
  )
  return { payload, order, encodedOrder, strategyHash: keccak256(encodedOrder) }
}

export function encodeExpectedVersion(version: bigint): Hex {
  if (version < 0n || version > (1n << 64n) - 1n) throw new Error('Version must fit uint64')
  return toHex(version, { size: 8 })
}

function encodeCurve(curve: CompiledCurve): Hex {
  return concatHex([
    uint128(curve.startPriceWad),
    uint128(curve.endPriceWad),
    int128(curve.alphaWad),
    uint128(curve.initialReserveWad),
    uint128(curve.muWad),
    uint128(curve.kappaWad),
  ])
}

function uint128(value: bigint): Hex {
  if (value < 0n || value > UINT128_MAX) throw new Error('Value must fit uint128')
  return toHex(value, { size: 16 })
}

function int128(value: bigint): Hex {
  if (value < INT128_MIN || value > INT128_MAX) throw new Error('Value must fit int128')
  return toHex(value < 0n ? (1n << 128n) + value : value, { size: 16 })
}
