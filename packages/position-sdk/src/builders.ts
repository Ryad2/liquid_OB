import {
  aquaAbi,
  batchExecutorAbi,
  erc20Abi,
  type DeploymentManifest,
} from '@liquid-ob/contracts'
import { buildPositionStrategy } from '@liquid-ob/curve-math'
import { encodeFunctionData, isAddress, size, type Address, type Hex } from 'viem'

import type {
  ContractCall,
  ExactInputRoute,
  ExactOutputRoute,
  PositionLocator,
  PublishPositionInput,
  PublishPositionPlan,
} from './types.js'

export function buildPublishPositionPlan(
  manifest: DeploymentManifest,
  input: PublishPositionInput,
): PublishPositionPlan {
  validateAddress(input.maker, 'maker')
  if (input.baseAllocation < 0n || input.quoteAllocation < 0n) {
    throw new Error('Allocations cannot be negative')
  }
  if (input.baseAllocation === 0n && input.quoteAllocation === 0n) {
    throw new Error('At least one allocation must be positive')
  }
  const strategy = buildPositionStrategy(input.config, input.maker, input.liquidCurveOpcode)
  const calls: ContractCall[] = []
  if (input.baseAllocation > 0n) {
    calls.push(
      call(
        'Approve base allocation to Aqua',
        input.config.baseToken,
        encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [manifest.contracts.aqua.address, input.baseAllocation],
        }),
      ),
    )
  }
  if (input.quoteAllocation > 0n) {
    calls.push(
      call(
        'Approve quote allocation to Aqua',
        input.config.quoteToken,
        encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [manifest.contracts.aqua.address, input.quoteAllocation],
        }),
      ),
    )
  }
  calls.push(
    call(
      'Publish immutable position through Aqua',
      manifest.contracts.aqua.address,
      encodeFunctionData({
        abi: aquaAbi,
        functionName: 'ship',
        args: [
          manifest.contracts.router.address,
          strategy.encodedOrder,
          [input.config.baseToken, input.config.quoteToken],
          [input.baseAllocation, input.quoteAllocation],
        ],
      }),
    ),
  )
  return { strategy, calls }
}

export function buildDockPositionCall(
  manifest: DeploymentManifest,
  position: PositionLocator,
  baseToken: Address,
  quoteToken: Address,
): ContractCall {
  validatePosition(position)
  validateAddress(baseToken, 'base token')
  validateAddress(quoteToken, 'quote token')
  return call(
    'Dock complete immutable position',
    manifest.contracts.aqua.address,
    encodeFunctionData({
      abi: aquaAbi,
      functionName: 'dock',
      args: [manifest.contracts.router.address, position.strategyHash, [baseToken, quoteToken]],
    }),
  )
}

export function buildExecuteExactInputCall(
  manifest: DeploymentManifest,
  route: ExactInputRoute,
): ContractCall {
  validateExactInput(route, manifest.config.maxFills)
  return call(
    'Execute atomic exact-input route',
    manifest.contracts.batchExecutor.address,
    encodeFunctionData({
      abi: batchExecutorAbi,
      functionName: 'executeExactInput',
      args: [route],
    }),
  )
}

export function buildExecuteExactOutputCall(
  manifest: DeploymentManifest,
  route: ExactOutputRoute,
): ContractCall {
  validateExactOutput(route, manifest.config.maxFills)
  return call(
    'Execute atomic exact-output route',
    manifest.contracts.batchExecutor.address,
    encodeFunctionData({
      abi: batchExecutorAbi,
      functionName: 'executeExactOutput',
      args: [route],
    }),
  )
}

function validateExactInput(route: ExactInputRoute, maxFills: number): void {
  validateRouteCommon(route, maxFills)
  if (route.amountIn <= 0n) throw new Error('Exact input must be positive')
  const total = route.fills.reduce((sum, fill) => sum + fill.amount, 0n)
  if (total !== route.amountIn) throw new Error('Fill inputs do not sum to aggregate input')
  if (route.minAmountOut < 0n) throw new Error('Minimum output cannot be negative')
}

function validateExactOutput(route: ExactOutputRoute, maxFills: number): void {
  validateRouteCommon(route, maxFills)
  if (route.amountOut <= 0n || route.maxAmountIn <= 0n) {
    throw new Error('Exact output and maximum input must be positive')
  }
  const total = route.fills.reduce((sum, fill) => sum + fill.amount, 0n)
  if (total !== route.amountOut) throw new Error('Fill outputs do not sum to aggregate output')
}

function validateRouteCommon(
  route: ExactInputRoute | ExactOutputRoute,
  maxFills: number,
): void {
  validateAddress(route.baseToken, 'base token')
  validateAddress(route.quoteToken, 'quote token')
  validateAddress(route.recipient, 'recipient')
  validateAddress(route.refundRecipient, 'refund recipient')
  if (route.baseToken.toLowerCase() === route.quoteToken.toLowerCase()) {
    throw new Error('Base and quote token must differ')
  }
  if (route.side !== 0 && route.side !== 1) throw new Error('Invalid curve side')
  if (size(route.salt) !== 32) throw new Error('Route salt must be bytes32')
  if (!Number.isSafeInteger(route.deadline) || route.deadline <= 0 || route.deadline > 2 ** 40 - 1) {
    throw new Error('Deadline must be a positive uint40 timestamp')
  }
  if (route.fills.length === 0 || route.fills.length > maxFills) {
    throw new Error(`Fill count must be between 1 and ${maxFills}`)
  }
  const keys = new Set<string>()
  for (const fill of route.fills) {
    validateAddress(fill.maker, 'fill maker')
    if (size(fill.strategyHash) !== 32) throw new Error('Strategy hash must be bytes32')
    if (fill.expectedVersion < 0n || fill.expectedVersion > (1n << 64n) - 1n) {
      throw new Error('Expected version must fit uint64')
    }
    if (fill.amount <= 0n) throw new Error('Fill amount must be positive')
    if (fill.strategy === '0x') throw new Error('Fill strategy cannot be empty')
    const key = `${fill.maker.toLowerCase()}:${fill.strategyHash.toLowerCase()}`
    if (keys.has(key)) throw new Error('Duplicate position in route')
    keys.add(key)
  }
}

function validatePosition(position: PositionLocator): void {
  validateAddress(position.maker, 'maker')
  if (size(position.strategyHash) !== 32) throw new Error('Strategy hash must be bytes32')
  if (position.strategy === '0x') throw new Error('Strategy cannot be empty')
}

function validateAddress(value: Address, label: string): void {
  if (!isAddress(value) || /^0x0{40}$/i.test(value)) throw new Error(`Invalid ${label} address`)
}

function call(label: string, to: Address, data: Hex): ContractCall {
  return { label, to, data, value: 0n }
}
