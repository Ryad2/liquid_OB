import {
  batchExecutorAbi,
  lensAbi,
  quoterAbi,
  type DeploymentManifest,
} from '@liquid-ob/contracts'
import { compileCurve, type CompiledCurve, type CurveSide } from '@liquid-ob/curve-math'
import type { RouteCertificate, SolverCandidate } from '@liquid-ob/solver-core'
import {
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  stringToHex,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem'

import { ApiError } from './errors.js'
import type {
  ChainGateway,
  ChainHealth,
  IndexedMarketSnapshot,
  PreparedFill,
  PreparedRoute,
  RouteRequest,
} from './types.js'

const ROUTE_TYPEHASH = keccak256(stringToHex(
  'LiquidOBRoute(uint256 chainId,address executor,address payer,bytes32 salt,uint8 kind)',
))

export interface LensCurveConfig {
  startPrice: bigint
  endPrice: bigint
  alpha: bigint
  initialReserve: bigint
  mu: bigint
  kappa: bigint
}

export interface LensPositionSnapshot {
  marketId: Hex
  positionKey: Hex
  positionId: Hex
  strategyHash: Hex
  policyHash: Hex
  maker: Address
  encodingVersion: number
  lifecycle: number
  config: {
    sell: LensCurveConfig
    buy: LensCurveConfig
  }
  runtime: {
    sell: { y: bigint; yInt: bigint }
    buy: { y: bigint; yInt: bigint }
    version: bigint
  }
  baseBacking: LensAssetBacking
  quoteBacking: LensAssetBacking
}

export interface LensAssetBacking {
  token: Address
  decimals: number
  aquaAllocation: bigint
  walletBalance: bigint
  aquaAllowance: bigint
  logicalOutgoing: bigint
  sufficientlyBacked: boolean
}

interface OnchainPositionQuote {
  marketId: Hex
  positionKey: Hex
  strategyHash: Hex
  curve: {
    amountIn: bigint
    amountOut: bigint
    nativeRateBefore: bigint
    nativeRateAfter: bigint
    displayedPriceBefore: bigint
    displayedPriceAfter: bigint
    displayedEffectivePrice: bigint
  }
  beforeState: {
    sell: { y: bigint; yInt: bigint }
    buy: { y: bigint; yInt: bigint }
  }
  afterState: {
    sell: { y: bigint; yInt: bigint }
    buy: { y: bigint; yInt: bigint }
  }
}

export class ViemChainGateway implements ChainGateway {
  readonly #client: PublicClient
  readonly #manifest: DeploymentManifest

  constructor(client: PublicClient, manifest: DeploymentManifest) {
    this.#client = client
    this.#manifest = manifest
  }

  async health(): Promise<ChainHealth> {
    try {
      const [chainId, headBlock] = await Promise.all([
        this.#client.getChainId(),
        this.#client.getBlockNumber(),
      ])
      return { chainId, headBlock }
    } catch (error) {
      throw new ApiError(
        'RPC_UNAVAILABLE',
        503,
        `RPC health check failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      )
    }
  }

  async readPosition(position: {
    maker: Address
    strategyHash: Hex
    strategy: Hex
  }): Promise<LensPositionSnapshot> {
    try {
      return await this.#client.readContract({
        address: this.#manifest.contracts.lens.address,
        abi: lensAbi,
        functionName: 'getPosition',
        args: [position],
      }) as unknown as LensPositionSnapshot
    } catch (error) {
      throw new ApiError(
        'RPC_UNAVAILABLE',
        503,
        `Lens position read failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      )
    }
  }

  async refreshCandidates(candidates: readonly SolverCandidate[]): Promise<SolverCandidate[]> {
    if (candidates.length === 0) return []
    try {
      const snapshots = await this.#client.readContract({
        address: this.#manifest.contracts.lens.address,
        abi: lensAbi,
        functionName: 'getPositions',
        args: [candidates.map((candidate) => ({
          maker: candidate.maker,
          strategyHash: candidate.strategyHash,
          strategy: candidate.strategy,
        }))],
      }) as unknown as readonly LensPositionSnapshot[]

      return candidates.map((candidate, index) => refreshCandidate(candidate, snapshots[index]!))
    } catch (error) {
      throw new ApiError(
        'RPC_UNAVAILABLE',
        503,
        `Lens refresh failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      )
    }
  }

  async prepareRoute(
    request: RouteRequest,
    market: IndexedMarketSnapshot,
    certificate: RouteCertificate,
    headBlock: bigint,
    simulate: boolean,
  ): Promise<PreparedRoute> {
    const fixedDecimals = fixedTokenDecimals(request, market)
    const fixedAmounts = distributeRawAmounts(
      certificate.fills.map((fill) => ({
        amountWad: fill.amountWad,
        key: fill.candidate.positionKey,
      })),
      request.amount,
      fixedDecimals,
    )
    const side = request.side === 'sell' ? 0 : 1
    let quotes: readonly OnchainPositionQuote[]
    try {
      const contracts = certificate.fills.map((fill, index) => ({
        address: this.#manifest.contracts.quoter.address,
        abi: quoterAbi,
        args: [{
          position: {
            maker: fill.candidate.maker,
            strategyHash: fill.candidate.strategyHash,
            strategy: fill.candidate.strategy,
          },
          side,
          expectedVersion: fill.candidate.expectedVersion,
          amount: fixedAmounts[index]!,
        }],
      }))
      const result = request.kind === 'exact-input'
        ? await this.#client.multicall({
            allowFailure: false,
            contracts: contracts.map((contract) => ({ ...contract, functionName: 'quoteExactInput' as const })),
          })
        : await this.#client.multicall({
            allowFailure: false,
            contracts: contracts.map((contract) => ({ ...contract, functionName: 'quoteExactOutput' as const })),
          })
      // Viem cannot preserve tuple output inference across a dynamically sized contract list.
      quotes = result as unknown as readonly OnchainPositionQuote[]
    } catch (error) {
      throw new ApiError(
        'RPC_UNAVAILABLE',
        503,
        `Authoritative quote refresh failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      )
    }

    const fills = quotes.map<PreparedFill>((quote, index) => {
      const candidate = certificate.fills[index]!.candidate
      validateQuoteIdentity(quote, candidate, request.marketId)
      const activeBefore = request.side === 'sell' ? quote.beforeState.sell : quote.beforeState.buy
      const activeAfter = request.side === 'sell' ? quote.afterState.sell : quote.afterState.buy
      return {
        index,
        positionId: candidate.id,
        positionKey: candidate.positionKey,
        maker: candidate.maker,
        strategyHash: candidate.strategyHash,
        expectedVersion: candidate.expectedVersion,
        fixedAmountRaw: fixedAmounts[index]!,
        amountInRaw: quote.curve.amountIn,
        amountOutRaw: quote.curve.amountOut,
        nativeRateBeforeWad: quote.curve.nativeRateBefore,
        nativeRateAfterWad: quote.curve.nativeRateAfter,
        displayedPriceBeforeWad: quote.curve.displayedPriceBefore,
        displayedPriceAfterWad: quote.curve.displayedPriceAfter,
        displayedEffectivePriceWad: quote.curve.displayedEffectivePrice,
        activeYBeforeWad: activeBefore.y,
        activeYAfterWad: activeAfter.y,
        activeYIntWad: activeBefore.yInt,
      }
    })
    const amountInRaw = sum(fills.map((fill) => fill.amountInRaw))
    const amountOutRaw = sum(fills.map((fill) => fill.amountOutRaw))
    const limitRaw = request.kind === 'exact-input'
      ? amountOutRaw * BigInt(10_000 - request.slippageBps) / 10_000n
      : divUp(amountInRaw * BigInt(10_000 + request.slippageBps), 10_000n)
    const kind = request.kind === 'exact-input' ? 0 : 1
    const salt = routeSalt(request, market.indexedBlock, headBlock)
    const deadline = Math.floor(Date.now() / 1_000) + request.deadlineSeconds
    const routeFills = certificate.fills.map((fill, index) => ({
      maker: fill.candidate.maker,
      strategyHash: fill.candidate.strategyHash,
      expectedVersion: fill.candidate.expectedVersion,
      amount: fixedAmounts[index]!,
      strategy: fill.candidate.strategy,
    }))
    const executor = this.#manifest.contracts.batchExecutor.address
    const commonRoute = {
      baseToken: market.baseToken.address,
      quoteToken: market.quoteToken.address,
      side,
      salt,
      recipient: request.recipient,
      refundRecipient: request.refundRecipient,
      deadline,
      fills: routeFills,
    }
    const data = request.kind === 'exact-input'
      ? encodeFunctionData({
          abi: batchExecutorAbi,
          functionName: 'executeExactInput',
          args: [{ ...commonRoute, amountIn: request.amount, minAmountOut: limitRaw }],
        })
      : encodeFunctionData({
          abi: batchExecutorAbi,
          functionName: 'executeExactOutput',
          args: [{ ...commonRoute, amountOut: request.amount, maxAmountIn: limitRaw }],
        })
    const transaction = { to: executor, data, value: 0n as const }
    let gasEstimate: bigint | null = null
    if (simulate) {
      try {
        await this.#client.call({
          account: request.payer,
          to: transaction.to,
          data: transaction.data,
          value: 0n,
          blockNumber: headBlock,
        })
        gasEstimate = await this.#client.estimateGas({
          account: request.payer,
          to: transaction.to,
          data: transaction.data,
          value: 0n,
        })
      } catch (error) {
        throw new ApiError(
          'SIMULATION_REVERTED',
          422,
          `Batch simulation reverted: ${error instanceof Error ? error.message : 'unknown error'}`,
        )
      }
    }

    const routeId = keccak256(encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'uint256' },
        { type: 'address' },
        { type: 'address' },
        { type: 'bytes32' },
        { type: 'uint8' },
      ],
      [ROUTE_TYPEHASH, BigInt(this.#manifest.network.chainId), executor, request.payer, salt, kind],
    ))
    return {
      routeId,
      marketId: request.marketId,
      side: request.side,
      kind: request.kind,
      indexedBlock: market.indexedBlock,
      chainHeadBlock: headBlock,
      indexLag: headBlock - market.indexedBlock,
      amountInRaw,
      amountOutRaw,
      limitRaw,
      deadline,
      fills,
      transaction,
      simulation: {
        status: simulate ? 'success' : 'not-run',
        gasEstimate,
        blockNumber: simulate ? headBlock : null,
      },
      certificate,
    }
  }
}

function refreshCandidate(candidate: SolverCandidate, snapshot: LensPositionSnapshot): SolverCandidate {
  if (snapshot.positionKey.toLowerCase() !== candidate.positionKey.toLowerCase()
    || snapshot.strategyHash.toLowerCase() !== candidate.strategyHash.toLowerCase()
    || snapshot.marketId.toLowerCase() !== candidate.marketId.toLowerCase()
    || snapshot.maker.toLowerCase() !== candidate.maker.toLowerCase()) {
    throw new ApiError('RPC_UNAVAILABLE', 503, `Lens identity mismatch for ${candidate.positionKey}`)
  }
  const config = candidate.side === 'sell' ? snapshot.config.sell : snapshot.config.buy
  const runtime = candidate.side === 'sell' ? snapshot.runtime.sell : snapshot.runtime.buy
  const backing = candidate.side === 'sell' ? snapshot.baseBacking : snapshot.quoteBacking
  return {
    ...candidate,
    curve: curveFromLens(config, candidate.side),
    state: { yWad: runtime.y, yIntWad: runtime.yInt },
    expectedVersion: snapshot.runtime.version,
    active: snapshot.lifecycle === 1,
    sufficientlyBacked: backing.sufficientlyBacked,
  }
}

function curveFromLens(config: LensCurveConfig, side: CurveSide): CompiledCurve {
  const compiled = compileCurve({
    startPriceWad: config.startPrice,
    endPriceWad: config.endPrice,
    alphaWad: config.alpha,
    initialReserveWad: config.initialReserve,
  }, side)
  return { ...compiled, muWad: config.mu, kappaWad: config.kappa }
}

function validateQuoteIdentity(quote: OnchainPositionQuote, candidate: SolverCandidate, marketId: Hex): void {
  if (quote.marketId.toLowerCase() !== marketId.toLowerCase()
    || quote.positionKey.toLowerCase() !== candidate.positionKey.toLowerCase()
    || quote.strategyHash.toLowerCase() !== candidate.strategyHash.toLowerCase()) {
    throw new ApiError('RPC_UNAVAILABLE', 503, `Quoter identity mismatch for ${candidate.positionKey}`)
  }
}

function distributeRawAmounts(
  allocations: readonly { amountWad: bigint; key: Hex }[],
  totalRaw: bigint,
  decimals: number,
): bigint[] {
  if (decimals < 0 || decimals > 18) throw new ApiError('INVALID_REQUEST', 400, 'Token decimals exceed MVP domain')
  const scale = 10n ** BigInt(18 - decimals)
  const result = allocations.map((allocation) => allocation.amountWad / scale)
  let remaining = totalRaw - sum(result)
  const remainders = allocations
    .map((allocation, index) => ({ index, remainder: allocation.amountWad % scale, key: allocation.key }))
    .sort((left, right) => {
      if (left.remainder !== right.remainder) return left.remainder > right.remainder ? -1 : 1
      return left.key.toLowerCase().localeCompare(right.key.toLowerCase())
    })
  for (const entry of remainders) {
    if (remaining === 0n) break
    result[entry.index] = result[entry.index]! + 1n
    remaining -= 1n
  }
  if (remaining !== 0n || result.some((amount) => amount <= 0n)) {
    throw new ApiError('INVALID_REQUEST', 400, 'Route cannot be represented in raw token precision')
  }
  return result
}

function fixedTokenDecimals(request: RouteRequest, market: IndexedMarketSnapshot): number {
  if (request.kind === 'exact-input') {
    return request.side === 'sell' ? market.quoteToken.decimals : market.baseToken.decimals
  }
  return request.side === 'sell' ? market.baseToken.decimals : market.quoteToken.decimals
}

function routeSalt(request: RouteRequest, indexedBlock: bigint, headBlock: bigint): Hex {
  return keccak256(encodeAbiParameters(
    [
      { type: 'bytes32' },
      { type: 'address' },
      { type: 'uint8' },
      { type: 'uint8' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'uint256' },
    ],
    [
      request.marketId,
      request.payer,
      request.side === 'sell' ? 0 : 1,
      request.kind === 'exact-input' ? 0 : 1,
      request.amount,
      indexedBlock,
      headBlock,
    ],
  ))
}

function divUp(numerator: bigint, denominator: bigint): bigint {
  return numerator === 0n ? 0n : ((numerator - 1n) / denominator) + 1n
}

function sum(values: readonly bigint[]): bigint {
  return values.reduce((total, value) => total + value, 0n)
}
