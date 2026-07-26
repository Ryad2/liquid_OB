import type { LiquidOBGateway, RouteInput } from './liquid-ob-client.js'
import type { Market, PreparedRoute } from './schemas.js'
import type { StandardDexGateway, StandardDexSnapshot } from './standard-dex.js'

export type QuoteToolInput = RouteInput

export class ExecutableLiquidityService {
  readonly #liquidOb: LiquidOBGateway
  readonly #standardDex: StandardDexGateway

  constructor(liquidOb: LiquidOBGateway, standardDex: StandardDexGateway) {
    this.#liquidOb = liquidOb
    this.#standardDex = standardDex
  }

  async discoverPositions(input: {
    marketId: string
    side: 'sell' | 'buy'
    minimumOutputRaw?: string
    limit: number
  }, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const [market, snapshot] = await Promise.all([
      this.#liquidOb.market(input.marketId, signal),
      this.#liquidOb.activePositions(input.marketId, input.side, signal),
    ])
    const minimum = input.minimumOutputRaw === undefined ? 0n : BigInt(input.minimumOutputRaw)
    const positions = snapshot.items
      .filter((position) => position.sufficientlyBacked)
      .map((position) => ({ position, curve: input.side === 'sell' ? position.sell : position.buy }))
      .filter(({ curve }) => BigInt(curve.runtime.availableOutput.raw) >= minimum)
      .slice(0, input.limit)
      .map(({ position, curve }) => ({
        positionId: position.id,
        maker: position.maker,
        strategyHash: position.strategyHash,
        runtimeVersion: position.runtimeVersion,
        branch: curve.policy.branch,
        startPriceWad: curve.policy.startPrice.wad,
        endPriceWad: curve.policy.endPrice.wad,
        alphaWad: curve.policy.alphaWad,
        availableOutputRaw: curve.runtime.availableOutput.raw,
        outputToken: curve.runtime.availableOutput.token,
        currentMarginalPriceWad: curve.runtime.currentMarginalPrice.wad,
        progressBps: curve.runtime.progressBps,
        lastUpdateBlock: position.lastUpdateBlock,
      }))
    return {
      market: marketIdentity(market),
      side: input.side,
      positions,
      discoveredCount: positions.length,
      provenance: {
        source: 'ArcBook Subgraph via Solver API',
        indexedBlock: snapshot.indexedBlock,
        chainHeadBlock: snapshot.chainHeadBlock,
        indexLag: snapshot.indexLag,
        stale: snapshot.stale,
        warnings: snapshot.warnings,
      },
    }
  }

  async quoteLiquidOb(input: QuoteToolInput, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const route = await this.#liquidOb.quote(input, false, signal)
    return routeEvidence(route, false)
  }

  async buildCandidateRoute(input: QuoteToolInput, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const route = await this.#liquidOb.quote(input, true, signal)
    if (route.simulation.status !== 'success') throw new Error('ArcBook candidate route did not pass final onchain simulation')
    return routeEvidence(route, true)
  }

  async compareExecutableLiquidity(input: QuoteToolInput, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const market = await this.#liquidOb.market(input.marketId, signal)
    const [liquidObResult, dexResult] = await Promise.allSettled([
      this.#liquidOb.quote(input, true, signal),
      this.#standardDex.compare(market, { side: input.side, kind: input.kind, amountRaw: input.amount }, signal),
    ])
    const simulatedRoute = liquidObResult.status === 'fulfilled' && liquidObResult.value.simulation.status === 'success'
      ? liquidObResult.value
      : null
    const liquidOb = simulatedRoute === null
      ? {
          available: false,
          error: liquidObResult.status === 'rejected'
            ? errorMessage(liquidObResult.reason)
            : 'ArcBook route did not pass final onchain simulation',
        }
      : { available: true, ...routeEvidence(simulatedRoute, true) }
    const dex = dexResult.status === 'fulfilled'
      ? dexResult.value
      : failedDex(market, input.side, errorMessage(dexResult.reason))
    return {
      market: marketIdentity(market),
      request: { side: input.side, kind: input.kind, amountRaw: input.amount },
      liquidOb,
      standardizedDex: dex,
      comparison: compareResults(simulatedRoute, dex, input.kind),
      semanticWarning: 'Only ArcBook is executable here because its route passed BatchExecutor eth_call. The standardized DEX result is indexed evidence or an explicitly modelled estimate, never executable calldata.',
    }
  }

  async health(signal?: AbortSignal): Promise<Record<string, unknown>> {
    const liquidOb = await this.#liquidOb.health(signal)
    if (!isHealthy(liquidOb)) throw new Error('ArcBook API dependencies are not healthy')
    return { status: 'ready', liquidOb }
  }
}

function routeEvidence(route: PreparedRoute, simulated: boolean): Record<string, unknown> {
  return {
    venue: 'ArcBook',
    executionStatus: simulated ? 'onchain-simulated' : 'unsigned-quote',
    routeId: route.routeId,
    marketId: route.marketId,
    side: route.side,
    kind: route.kind,
    indexedBlock: route.indexedBlock,
    chainHeadBlock: route.chainHeadBlock,
    indexLag: route.indexLag,
    amountInRaw: route.amountInRaw,
    amountOutRaw: route.amountOutRaw,
    limitRaw: route.limitRaw,
    deadline: route.deadline,
    fills: route.fills,
    simulation: route.simulation,
    transaction: simulated ? route.transaction : null,
  }
}

function marketIdentity(market: Market): Record<string, unknown> {
  return {
    id: market.id,
    baseToken: market.baseToken,
    quoteToken: market.quoteToken,
    priceDirection: `${market.quoteToken.symbol} per ${market.baseToken.symbol}`,
  }
}

function compareResults(
  liquidOb: PreparedRoute | null,
  dex: StandardDexSnapshot,
  kind: 'exact-input' | 'exact-output',
): Record<string, unknown> {
  if (liquidOb === null || dex.bestEstimate === null || dex.hasIndexingErrors === true) {
    return { status: 'not-comparable', preferredVenue: null, reason: 'Both a simulated ArcBook route and a modelled DEX estimate are required.' }
  }
  const liquidValue = BigInt(kind === 'exact-input' ? liquidOb.amountOutRaw : liquidOb.amountInRaw)
  const dexValue = BigInt(kind === 'exact-input' ? dex.bestEstimate.amountOutRaw : dex.bestEstimate.amountInRaw)
  const liquidWins = kind === 'exact-input' ? liquidValue >= dexValue : liquidValue <= dexValue
  return {
    status: 'indicative-only',
    preferredVenue: liquidWins ? 'ArcBook' : dex.venue,
    reason: kind === 'exact-input' ? 'Higher indexed/modelled output' : 'Lower indexed/modelled input',
    liquidObRouteSimulated: true,
    executableWinnerConfirmed: false,
  }
}

function failedDex(market: Market, side: 'sell' | 'buy', error: string): StandardDexSnapshot {
  return {
    configured: true,
    venue: 'Standardized DEX AMM',
    model: 'snapshot-only',
    indexedBlock: null,
    hasIndexingErrors: null,
    tokenIn: side === 'sell' ? market.quoteToken.address : market.baseToken.address,
    tokenOut: side === 'sell' ? market.baseToken.address : market.quoteToken.address,
    pools: [],
    bestEstimate: null,
    executionStatus: 'indexed-snapshot-only',
    caveats: [`Standardized DEX source failed: ${error}`],
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isHealthy(value: unknown): boolean {
  return typeof value === 'object' && value !== null && (value as { status?: unknown }).status === 'healthy'
}
