import {
  quoteExactInput,
  quoteExactOutput,
  type CurveQuote,
  type QuoteKind,
} from '@liquid-ob/curve-math'

import {
  SolverError,
  type RejectedCandidate,
  type ReserveCandidate,
  type RouteCertificate,
  type SolveRequest,
  type SolverCandidate,
  type SolverFill,
} from './types.js'

interface CandidateMetrics {
  candidate: SolverCandidate
  capacity: bigint
  startRate: bigint
  endRate: bigint
  fullQuote: CurveQuote
}

interface UnboundedSolution {
  fills: SolverFill[]
  amountInWad: bigint
  amountOutWad: bigint
}

const MAX_RATE_SEARCH_STEPS = 192
const MAX_ALLOCATION_SEARCH_STEPS = 192

export function solveRoute(request: SolveRequest): RouteCertificate {
  validateRequest(request)
  const { metrics, rejected } = normalizeCandidates(request)
  if (metrics.length === 0) {
    throw new SolverError('insufficient-liquidity', 'No eligible position can serve this route')
  }

  const solution = enforceFillBound(metrics, request.kind, request.amountWad, request.maxFills)
  const fillKeys = new Set(solution.fills.map((fill) => fill.candidate.positionKey.toLowerCase()))
  const reserveCount = request.reserveCount ?? request.maxFills
  const reserveCandidates = metrics
    .filter((metric) => !fillKeys.has(metric.candidate.positionKey.toLowerCase()))
    .sort(compareMetrics)
    .slice(0, Math.max(0, reserveCount))
    .map<ReserveCandidate>((metric) => ({
      id: metric.candidate.id,
      positionKey: metric.candidate.positionKey,
      expectedVersion: metric.candidate.expectedVersion,
      nativeRateWad: metric.startRate,
    }))

  return {
    marketId: request.marketId,
    side: request.side,
    kind: request.kind,
    snapshotBlock: request.snapshotBlock,
    fixedAmountWad: request.amountWad,
    amountInWad: solution.amountInWad,
    amountOutWad: solution.amountOutWad,
    fills: solution.fills,
    reserveCandidates,
    rejectedCandidates: rejected,
  }
}

function normalizeCandidates(request: SolveRequest): {
  metrics: CandidateMetrics[]
  rejected: RejectedCandidate[]
} {
  const metrics: CandidateMetrics[] = []
  const rejected: RejectedCandidate[] = []
  const seen = new Set<string>()

  for (const candidate of request.candidates) {
    const key = candidate.positionKey.toLowerCase()
    if (seen.has(key)) {
      throw new SolverError('duplicate-candidate', `Duplicate position key ${candidate.positionKey}`)
    }
    seen.add(key)

    const rejection = rejectionFor(candidate, request)
    if (rejection !== null) {
      rejected.push({ id: candidate.id, ...rejection })
      continue
    }

    try {
      metrics.push(measureCandidate(candidate, request.kind))
    } catch (error) {
      rejected.push({
        id: candidate.id,
        code: 'invalid-curve',
        message: error instanceof Error ? error.message : 'Curve evaluation failed',
      })
    }
  }

  metrics.sort(compareMetrics)
  return { metrics, rejected }
}

function rejectionFor(
  candidate: SolverCandidate,
  request: SolveRequest,
): Omit<RejectedCandidate, 'id'> | null {
  if (candidate.marketId.toLowerCase() !== request.marketId.toLowerCase()) {
    return { code: 'wrong-market', message: 'Candidate belongs to another market' }
  }
  if (candidate.side !== request.side) {
    return { code: 'wrong-side', message: 'Candidate belongs to the opposite curve side' }
  }
  if (!candidate.active) return { code: 'inactive', message: 'Position is not active' }
  if (!candidate.sufficientlyBacked) return { code: 'unbacked', message: 'Position is not sufficiently backed' }
  if (candidate.state.yWad <= 0n) return { code: 'exhausted', message: 'Curve side has no output reserve' }
  return null
}

function measureCandidate(candidate: SolverCandidate, kind: QuoteKind): CandidateMetrics {
  const fullQuote = quoteExactOutput(
    candidate.curve,
    candidate.side,
    candidate.state,
    candidate.state.yWad,
  )
  const capacity = kind === 'exact-input' ? fullQuote.amountInWad : candidate.state.yWad
  if (capacity <= 0n || fullQuote.nativeRateBeforeWad <= 0n) {
    throw new Error('Curve has no positive executable capacity')
  }
  return {
    candidate,
    capacity,
    startRate: fullQuote.nativeRateBeforeWad,
    endRate: fullQuote.nativeRateAfterWad,
    fullQuote,
  }
}

function enforceFillBound(
  allMetrics: CandidateMetrics[],
  kind: QuoteKind,
  amount: bigint,
  maxFills: number,
): UnboundedSolution {
  let available = [...allMetrics]
  let solution = solveUnbounded(available, kind, amount)

  while (solution.fills.length > maxFills) {
    let best: { available: CandidateMetrics[]; solution: UnboundedSolution } | null = null
    const activeKeys = new Set(solution.fills.map((fill) => fill.candidate.positionKey.toLowerCase()))

    for (const removable of available) {
      if (!activeKeys.has(removable.candidate.positionKey.toLowerCase())) continue
      const proposedAvailable = available.filter((metric) => metric !== removable)
      try {
        const proposed = solveUnbounded(proposedAvailable, kind, amount)
        if (best === null || isBetter(proposed, best.solution, kind)) {
          best = { available: proposedAvailable, solution: proposed }
        }
      } catch (error) {
        if (!(error instanceof SolverError) || error.code !== 'insufficient-liquidity') throw error
      }
    }

    if (best === null) {
      throw new SolverError(
        'max-fills-exceeded',
        `The requested amount requires more than ${maxFills} fills`,
      )
    }
    available = best.available
    solution = best.solution
  }

  return solution
}

function solveUnbounded(
  metrics: CandidateMetrics[],
  kind: QuoteKind,
  target: bigint,
): UnboundedSolution {
  const totalCapacity = sum(metrics.map((metric) => metric.capacity))
  if (totalCapacity < target) {
    throw new SolverError(
      'insufficient-liquidity',
      `Requested ${target} WAD but only ${totalCapacity} WAD is executable`,
    )
  }

  let lowRate = 0n
  let highRate = metrics.reduce(
    (maximum, metric) => metric.startRate > maximum ? metric.startRate : maximum,
    0n,
  ) + 1n

  for (let step = 0; step < MAX_RATE_SEARCH_STEPS && highRate - lowRate > 1n; step += 1) {
    const middle = (lowRate + highRate) / 2n
    const total = sum(allocationsAtRate(metrics, kind, middle))
    if (total >= target) lowRate = middle
    else highRate = middle
  }

  const lowerAllocations = allocationsAtRate(metrics, kind, lowRate)
  const allocations = allocationsAtRate(metrics, kind, highRate)
  let remaining = target - sum(allocations)
  if (remaining < 0n) throw new SolverError('invalid-request', 'Marginal allocation exceeded target')

  const band = metrics
    .map((metric, index) => ({
      index,
      available: lowerAllocations[index]! - allocations[index]!,
      rate: rateAfter(metric, kind, allocations[index]!),
      key: metric.candidate.positionKey.toLowerCase(),
    }))
    .filter((entry) => entry.available > 0n)
    .sort((left, right) => {
      if (left.rate !== right.rate) return left.rate > right.rate ? -1 : 1
      return left.key.localeCompare(right.key)
    })

  for (const entry of band) {
    if (remaining === 0n) break
    const granted = entry.available < remaining ? entry.available : remaining
    allocations[entry.index] = allocations[entry.index]! + granted
    remaining -= granted
  }
  if (remaining !== 0n) {
    throw new SolverError('insufficient-liquidity', 'Unable to allocate the complete fixed amount')
  }

  const fills: SolverFill[] = []
  for (let index = 0; index < metrics.length; index += 1) {
    const amountWad = allocations[index]!
    if (amountWad === 0n) continue
    const metric = metrics[index]!
    fills.push({
      index: fills.length,
      candidate: metric.candidate,
      amountWad,
      quote: quoteAt(metric, kind, amountWad),
    })
  }

  const amountInWad = sum(fills.map((fill) => fill.quote.amountInWad))
  const amountOutWad = sum(fills.map((fill) => fill.quote.amountOutWad))
  return { fills, amountInWad, amountOutWad }
}

function allocationsAtRate(
  metrics: CandidateMetrics[],
  kind: QuoteKind,
  threshold: bigint,
): bigint[] {
  return metrics.map((metric) => allocationAtRate(metric, kind, threshold))
}

function allocationAtRate(
  metric: CandidateMetrics,
  kind: QuoteKind,
  threshold: bigint,
): bigint {
  if (metric.startRate < threshold) return 0n
  if (metric.endRate >= threshold || metric.candidate.curve.branch === 'flat') {
    return metric.capacity
  }

  let low = 0n
  let high = metric.capacity
  for (let step = 0; step < MAX_ALLOCATION_SEARCH_STEPS && high - low > 1n; step += 1) {
    const middle = (low + high) / 2n
    if (rateAfter(metric, kind, middle) >= threshold) low = middle
    else high = middle
  }
  return low
}

function rateAfter(metric: CandidateMetrics, kind: QuoteKind, amount: bigint): bigint {
  if (amount === 0n) return metric.startRate
  return quoteAt(metric, kind, amount).nativeRateAfterWad
}

function quoteAt(metric: CandidateMetrics, kind: QuoteKind, amount: bigint): CurveQuote {
  if (amount <= 0n || amount > metric.capacity) throw new Error('Allocation is outside candidate capacity')
  if (kind === 'exact-output' && amount === metric.capacity) return metric.fullQuote
  return kind === 'exact-input'
    ? quoteExactInput(metric.candidate.curve, metric.candidate.side, metric.candidate.state, amount)
    : quoteExactOutput(metric.candidate.curve, metric.candidate.side, metric.candidate.state, amount)
}

function isBetter(left: UnboundedSolution, right: UnboundedSolution, kind: QuoteKind): boolean {
  if (kind === 'exact-input' && left.amountOutWad !== right.amountOutWad) {
    return left.amountOutWad > right.amountOutWad
  }
  if (kind === 'exact-output' && left.amountInWad !== right.amountInWad) {
    return left.amountInWad < right.amountInWad
  }
  return routeKey(left).localeCompare(routeKey(right)) < 0
}

function routeKey(solution: UnboundedSolution): string {
  return solution.fills.map((fill) => fill.candidate.positionKey.toLowerCase()).join(':')
}

function compareMetrics(left: CandidateMetrics, right: CandidateMetrics): number {
  if (left.startRate !== right.startRate) return left.startRate > right.startRate ? -1 : 1
  return left.candidate.positionKey.toLowerCase().localeCompare(right.candidate.positionKey.toLowerCase())
}

function validateRequest(request: SolveRequest): void {
  if (request.amountWad <= 0n) throw new SolverError('invalid-request', 'Amount must be positive')
  if (!Number.isInteger(request.maxFills) || request.maxFills <= 0 || request.maxFills > 65_535) {
    throw new SolverError('invalid-request', 'maxFills must fit a positive uint16')
  }
  if (request.reserveCount !== undefined
    && (!Number.isInteger(request.reserveCount) || request.reserveCount < 0)) {
    throw new SolverError('invalid-request', 'reserveCount must be a non-negative integer')
  }
}

function sum(values: readonly bigint[]): bigint {
  return values.reduce((total, value) => total + value, 0n)
}
