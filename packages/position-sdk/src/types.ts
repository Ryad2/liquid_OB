import type { PositionConfig, PositionStrategy } from '@liquid-ob/curve-math'
import type { Address, Hex } from 'viem'

export type OnchainCurveSide = 0 | 1

export interface PositionLocator {
  maker: Address
  strategyHash: Hex
  strategy: Hex
}

export interface FillRequest {
  maker: Address
  strategyHash: Hex
  expectedVersion: bigint
  amount: bigint
  strategy: Hex
}

export interface ExactInputRoute {
  baseToken: Address
  quoteToken: Address
  side: OnchainCurveSide
  salt: Hex
  amountIn: bigint
  minAmountOut: bigint
  recipient: Address
  refundRecipient: Address
  deadline: number
  fills: FillRequest[]
}

export interface ExactOutputRoute {
  baseToken: Address
  quoteToken: Address
  side: OnchainCurveSide
  salt: Hex
  amountOut: bigint
  maxAmountIn: bigint
  recipient: Address
  refundRecipient: Address
  deadline: number
  fills: FillRequest[]
}

export interface ContractCall {
  label: string
  to: Address
  data: Hex
  value: 0n
}

export interface PublishPositionInput {
  maker: Address
  config: PositionConfig
  liquidCurveOpcode: number
  baseAllocation: bigint
  quoteAllocation: bigint
}

export interface PublishPositionPlan {
  strategy: PositionStrategy
  calls: ContractCall[]
}

export interface QuoteRequest {
  position: PositionLocator
  side: OnchainCurveSide
  expectedVersion: bigint
  amount: bigint
}
