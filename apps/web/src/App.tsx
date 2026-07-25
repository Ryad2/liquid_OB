import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ActivityItem,
  Address,
  CurveDraft,
  CurveSample,
  CurveSide,
  FrontendBootstrap,
  MarketDetail,
  PositionDraft,
  PositionPreview,
  PositionSummary,
  RouteQuote,
  TransactionPlan,
} from '@liquid-ob/frontend-api'
import { parseUnits } from '@liquid-ob/frontend-api'
import { protocolClient } from './protocol/client'
import {
  connectInjectedWallet,
  currentInjectedAccount,
  executeTransactionPlan,
  watchInjectedWallet,
} from './protocol/wallet'
import './App.css'

type AppView = 'home' | 'trade' | 'portfolio' | 'studio'
type CurveFilter = 'all' | CurveSide

interface GatewayView {
  bootstrap: FrontendBootstrap
  market: MarketDetail
  positions: PositionSummary[]
  activity: ActivityItem[]
}

interface ChartSeries {
  id: string
  side: CurveSide
  label: string
  samples: CurveSample[]
  progressBps?: number
  reserveLabel: string
  draft?: boolean
}

interface OperationState {
  running: boolean
  message: string | null
  error: string | null
}

type ConnectWallet = () => Promise<Address | null>
type ExecutePlan = (plan: TransactionPlan) => Promise<void>

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
})

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function shortId(id: string) {
  return `${id.slice(0, 6)}…${id.slice(-4)}`
}

function formatNumber(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
  }).format(value)
}

function formatPrice(value: number) {
  const magnitude = Math.abs(value)
  if (magnitude >= 1_000_000 || (magnitude > 0 && magnitude < 0.0001)) {
    return value.toExponential(2)
  }
  if (magnitude >= 1_000) return formatNumber(value, 0)
  if (magnitude >= 1) return formatNumber(value, 2)
  if (magnitude >= 0.01) return formatNumber(value, 4)
  return value.toPrecision(3)
}

function branchLabel(branch: PositionSummary['sell']['policy']['branch']) {
  if (branch === 'flat') return 'Flat'
  if (branch === 'native-alpha-zero') return 'Geometric'
  if (branch === 'native-alpha-one') return 'Linear native'
  return 'General'
}

function getInitialView(): AppView {
  const route = window.location.hash.replace('#/', '')
  if (route === 'trade' || route === 'portfolio' || route === 'studio') return route
  return 'home'
}

function seriesFromPositions(
  positions: PositionSummary[],
  filter: CurveFilter = 'all',
): ChartSeries[] {
  return positions.flatMap((position, index) => {
    const sides: CurveSide[] = filter === 'all' ? ['buy', 'sell'] : [filter]
    return sides.map((side) => ({
      id: `${position.id}-${side}`,
      side,
      label: `P${index + 1} ${side}`,
      samples: position[side].marginalSamples,
      progressBps: position[side].runtime.progressBps,
      reserveLabel: `${position[side].runtime.availableOutput.formatted} ${
        position[side].runtime.availableOutput.token.symbol
      }`,
    }))
  })
}

function buildPath(
  samples: CurveSample[],
  xForPrice: (price: number) => number,
  yForProgress: (progressBps: number) => number,
) {
  return samples.map((sample, index) => {
    const price = Number(sample.displayedMarginalPrice.formatted)
    const x = xForPrice(price)
    const y = yForProgress(sample.progressBps)
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
  }).join(' ')
}

function CurveChart({
  series,
  market,
  selectedId,
  onSelect,
  compact = false,
}: {
  series: ChartSeries[]
  market: MarketDetail
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  compact?: boolean
}) {
  const width = 920
  const height = compact ? 310 : 430
  const inset = { top: 24, right: 24, bottom: 42, left: 72 }
  const prices = series.flatMap((item) => (
    item.samples.map((sample) => Number(sample.displayedMarginalPrice.formatted))
  )).filter(Number.isFinite)
  const marketPrices = [market.bestBid, market.bestAsk]
    .filter((price): price is NonNullable<typeof price> => price !== null)
    .map((price) => Number(price.formatted))
  const values = [...prices, ...marketPrices].filter((price) => price > 0)
  const rawMin = values.length > 0 ? Math.min(...values) : 1
  const rawMax = values.length > 0 ? Math.max(...values) : 2
  const useLogScale = rawMax / rawMin >= 6
  const rawLogMin = Math.log(rawMin)
  const rawLogMax = Math.log(rawMax)
  const logPadding = Math.max((rawLogMax - rawLogMin) * 0.06, 0.025)
  const linearPadding = Math.max((rawMax - rawMin) * 0.08, rawMax * 0.005)
  const minPrice = useLogScale
    ? Math.exp(rawLogMin - logPadding)
    : Math.max(rawMin - linearPadding, rawMin * 0.5)
  const maxPrice = useLogScale
    ? Math.exp(rawLogMax + logPadding)
    : rawMax + linearPadding
  const innerHeight = height - inset.top - inset.bottom
  const innerWidth = width - inset.left - inset.right
  const scaleMin = useLogScale ? Math.log(minPrice) : minPrice
  const scaleMax = useLogScale ? Math.log(maxPrice) : maxPrice
  const scaleSpan = Math.max(scaleMax - scaleMin, Number.EPSILON)
  const xForPrice = (price: number) => {
    const scaledPrice = useLogScale ? Math.log(Math.max(price, Number.MIN_VALUE)) : price
    return inset.left + ((scaledPrice - scaleMin) / scaleSpan) * innerWidth
  }
  const yForProgress = (progressBps: number) => (
    inset.top + (Math.max(0, Math.min(progressBps, 10_000)) / 10_000) * innerHeight
  )
  const referencePrice = market.bestBid !== null && market.bestAsk !== null
    ? (Number(market.bestBid.formatted) + Number(market.bestAsk.formatted)) / 2
    : null
  const priceTicks = Array.from({ length: 5 }, (_, index) => {
    const scaledTick = scaleMin + ((scaleSpan * index) / 4)
    return useLogScale ? Math.exp(scaledTick) : scaledTick
  })
  const inventoryTicks = [0, 2_500, 5_000, 7_500, 10_000]

  return (
    <div className="curve-chart-shell">
      <div className="chart-corner-label">
        <span>Range field</span>
        <small>INVENTORY REMAINING · %</small>
      </div>
      <svg
        className="curve-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Inventory distribution across each position price range"
        onMouseLeave={() => onSelect?.(null)}
      >
        <defs>
          <linearGradient id="buy-glow" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#62d9ff" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#62d9ff" stopOpacity="1" />
          </linearGradient>
          <linearGradient id="sell-glow" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ff9a72" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#ff9a72" stopOpacity="1" />
          </linearGradient>
        </defs>

        {inventoryTicks.map((tick) => {
          const y = yForProgress(tick)
          return (
            <g key={tick}>
              <line className="chart-grid-line" x1={inset.left} x2={width - inset.right} y1={y} y2={y} />
              <text className="chart-axis-label" x={inset.left - 12} y={y + 4}>
                {100 - (tick / 100)}%
              </text>
            </g>
          )
        })}

        {priceTicks.map((tick) => {
          const x = xForPrice(tick)
          return (
            <g key={tick}>
              <line className="chart-grid-line chart-grid-vertical" x1={x} x2={x} y1={inset.top} y2={height - inset.bottom} />
              <text className="chart-progress-label" x={x} y={height - 14}>{formatPrice(tick)}</text>
            </g>
          )
        })}

        {series.map((item) => {
          const start = item.samples.at(0)
          const end = item.samples.at(-1)
          if (start === undefined || end === undefined) return null
          const startX = xForPrice(Number(start.displayedMarginalPrice.formatted))
          const endX = xForPrice(Number(end.displayedMarginalPrice.formatted))
          const isVisible = selectedId === undefined || selectedId === null || selectedId === item.id
          return (
            <rect
              key={`range-${item.id}`}
              className={`range-band range-band-${item.side} ${isVisible ? 'is-visible' : 'is-muted'}`}
              x={Math.min(startX, endX)}
              y={inset.top}
              width={Math.max(Math.abs(endX - startX), 2)}
              height={innerHeight}
            />
          )
        })}

        {referencePrice !== null ? (
          <g>
            <line
              className="market-reference-line"
              x1={xForPrice(referencePrice)}
              x2={xForPrice(referencePrice)}
              y1={inset.top}
              y2={height - inset.bottom}
            />
            <text className="market-reference-label" x={xForPrice(referencePrice)} y={inset.top + 12}>
              MID {formatNumber(referencePrice, 2)}
            </text>
          </g>
        ) : null}

        {series.map((item) => {
          const isSelected = selectedId === undefined || selectedId === null || selectedId === item.id
          const path = buildPath(item.samples, xForPrice, yForProgress)
          const progress = item.progressBps ?? 0
          const sampleIndex = Math.min(
            item.samples.length - 1,
            Math.round((progress / 10_000) * (item.samples.length - 1)),
          )
          const activeSample = item.samples[sampleIndex]
          const activePrice = activeSample === undefined
            ? null
            : Number(activeSample.displayedMarginalPrice.formatted)
          const activeX = activePrice === null ? null : xForPrice(activePrice)
          const activeY = yForProgress(progress)
          const firstSample = item.samples.at(0)
          const lastSample = item.samples.at(-1)

          return (
            <g
              key={item.id}
              className={`curve-series ${isSelected ? 'is-selected' : 'is-muted'}`}
              onMouseEnter={() => onSelect?.(item.id)}
              onFocus={() => onSelect?.(item.id)}
            >
              <path
                className={`curve-hit-area curve-${item.side}`}
                d={path}
                tabIndex={onSelect === undefined ? -1 : 0}
                aria-label={`${item.label}, ${item.reserveLabel}`}
              />
              <path className={`curve-path curve-${item.side} ${item.draft === true ? 'is-draft' : ''}`} d={path} />
              {firstSample !== undefined ? (
                <circle
                  className={`range-endpoint endpoint-${item.side}`}
                  cx={xForPrice(Number(firstSample.displayedMarginalPrice.formatted))}
                  cy={yForProgress(firstSample.progressBps)}
                  r="4"
                />
              ) : null}
              {lastSample !== undefined ? (
                <circle
                  className={`range-endpoint endpoint-${item.side}`}
                  cx={xForPrice(Number(lastSample.displayedMarginalPrice.formatted))}
                  cy={yForProgress(lastSample.progressBps)}
                  r="4"
                />
              ) : null}
              {item.progressBps !== undefined && activeX !== null ? (
                <>
                  <line className={`progress-marker progress-${item.side}`} x1={activeX} x2={activeX} y1={activeY} y2={height - inset.bottom} />
                  <circle className={`current-point point-${item.side}`} cx={activeX} cy={activeY} r="5.5" />
                </>
              ) : null}
            </g>
          )
        })}
      </svg>
      <div className="chart-legend">
        <span><i className="legend-dot buy" /> Buy curves</span>
        <span><i className="legend-dot sell" /> Sell curves</span>
        <span><i className="legend-line" /> Indexed mid price</span>
        <small>PRICE RANGE · {market.quoteToken.symbol}/{market.baseToken.symbol} →</small>
      </div>
    </div>
  )
}

function HeroCurveCanvas({ alpha }: { alpha: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const context = canvas.getContext('2d')
    if (context === null) return
    let animationFrame = 0

    const pointOnQuadratic = (
      progress: number,
      start: { x: number; y: number },
      control: { x: number; y: number },
      end: { x: number; y: number },
    ) => {
      const inverse = 1 - progress
      return {
        x: (inverse * inverse * start.x) + (2 * inverse * progress * control.x) + (progress * progress * end.x),
        y: (inverse * inverse * start.y) + (2 * inverse * progress * control.y) + (progress * progress * end.y),
      }
    }

    const draw = (time: number) => {
      const bounds = canvas.getBoundingClientRect()
      const width = Math.max(bounds.width, 1)
      const height = Math.max(bounds.height, 1)
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      const nextWidth = Math.round(width * pixelRatio)
      const nextHeight = Math.round(height * pixelRatio)
      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth
        canvas.height = nextHeight
      }
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      context.clearRect(0, 0, width, height)

      const inset = { x: width * 0.07, y: height * 0.1 }
      const innerWidth = width - (inset.x * 2)
      const innerHeight = height - (inset.y * 1.7)
      context.lineWidth = 1
      context.strokeStyle = 'rgba(158, 174, 225, 0.1)'
      for (let index = 0; index <= 5; index += 1) {
        const x = inset.x + ((innerWidth * index) / 5)
        const y = inset.y + ((innerHeight * index) / 5)
        context.beginPath()
        context.moveTo(x, inset.y)
        context.lineTo(x, inset.y + innerHeight)
        context.stroke()
        context.beginPath()
        context.moveTo(inset.x, y)
        context.lineTo(inset.x + innerWidth, y)
        context.stroke()
      }

      const normalizedAlpha = Math.max(-1, Math.min(alpha / 20, 1))
      const buyStart = { x: inset.x, y: inset.y + (innerHeight * 0.88) }
      const buyEnd = { x: inset.x + (innerWidth * 0.47), y: inset.y + (innerHeight * 0.2) }
      const buyControl = {
        x: inset.x + (innerWidth * (0.22 + (normalizedAlpha * 0.16))),
        y: inset.y + (innerHeight * (0.5 - (normalizedAlpha * 0.34))),
      }
      const sellStart = { x: inset.x + (innerWidth * 0.53), y: inset.y + (innerHeight * 0.2) }
      const sellEnd = { x: inset.x + innerWidth, y: inset.y + (innerHeight * 0.88) }
      const sellControl = {
        x: inset.x + (innerWidth * (0.78 - (normalizedAlpha * 0.16))),
        y: inset.y + (innerHeight * (0.5 + (normalizedAlpha * 0.34))),
      }

      const buyGradient = context.createLinearGradient(buyStart.x, buyStart.y, buyEnd.x, buyEnd.y)
      buyGradient.addColorStop(0, 'rgba(98, 217, 255, 0.32)')
      buyGradient.addColorStop(1, '#62d9ff')
      context.strokeStyle = buyGradient
      context.lineWidth = 2.6
      context.beginPath()
      context.moveTo(buyStart.x, buyStart.y)
      context.quadraticCurveTo(buyControl.x, buyControl.y, buyEnd.x, buyEnd.y)
      context.stroke()

      const sellGradient = context.createLinearGradient(sellStart.x, sellStart.y, sellEnd.x, sellEnd.y)
      sellGradient.addColorStop(0, '#a99dff')
      sellGradient.addColorStop(1, '#ff9a72')
      context.strokeStyle = sellGradient
      context.beginPath()
      context.moveTo(sellStart.x, sellStart.y)
      context.quadraticCurveTo(sellControl.x, sellControl.y, sellEnd.x, sellEnd.y)
      context.stroke()

      const midX = inset.x + (innerWidth * 0.5)
      context.strokeStyle = 'rgba(237, 240, 255, 0.32)'
      context.setLineDash([4, 6])
      context.beginPath()
      context.moveTo(midX, inset.y)
      context.lineTo(midX, inset.y + innerHeight)
      context.stroke()
      context.setLineDash([])

      const particleProgress = (time * 0.00016) % 1
      const drawParticles = (
        start: { x: number; y: number },
        control: { x: number; y: number },
        end: { x: number; y: number },
        color: string,
      ) => {
        for (let index = 0; index < 5; index += 1) {
          const progress = (particleProgress + (index * 0.2)) % 1
          const point = pointOnQuadratic(progress, start, control, end)
          const radius = 2.2 + (Math.sin((time * 0.004) + index) * 0.7)
          context.fillStyle = color
          context.shadowColor = color
          context.shadowBlur = 10
          context.beginPath()
          context.arc(point.x, point.y, radius, 0, Math.PI * 2)
          context.fill()
        }
        context.shadowBlur = 0
      }
      drawParticles(buyStart, buyControl, buyEnd, '#62d9ff')
      drawParticles(sellStart, sellControl, sellEnd, '#ff9a72')

      context.fillStyle = 'rgba(137, 144, 173, 0.72)'
      context.font = '9px "IBM Plex Mono", monospace'
      context.fillText('1,550', buyStart.x, inset.y + innerHeight + 19)
      context.fillText('1,945', buyEnd.x - 18, inset.y + innerHeight + 19)
      context.fillText('2,004', sellStart.x - 18, inset.y + innerHeight + 19)
      context.fillText('2,350', sellEnd.x - 30, inset.y + innerHeight + 19)

      animationFrame = window.requestAnimationFrame(draw)
    }

    animationFrame = window.requestAnimationFrame(draw)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [alpha])

  return (
    <canvas
      ref={canvasRef}
      className="hero-curve-canvas"
      role="img"
      aria-label={`Animated ArcBook liquidity field with alpha ${alpha.toFixed(2)}`}
    />
  )
}

function LandingView({
  view,
  onNavigate,
}: {
  view: GatewayView
  onNavigate: (view: AppView) => void
}) {
  const [alpha, setAlpha] = useState(4.2)

  return (
    <main className="landing-page">
      <section className="landing-hero">
        <div className="landing-copy">
          <span className="landing-eyebrow"><i /> CURVE-NATIVE ORDER BOOK</span>
          <h1 aria-label="Shape the book.">Shape the<br /><em>book.</em></h1>
          <p>ArcBook turns bounded liquidity into executable curves. Market makers shape the range; traders route across the field.</p>
          <div className="landing-actions">
            <button className="landing-primary" onClick={() => onNavigate('trade')}>Open terminal <span>↗</span></button>
            <button className="landing-secondary" onClick={() => onNavigate('studio')}>Shape a curve <span>⌁</span></button>
          </div>
          <div className="landing-proof">
            <span><b>01</b><small>Two-sided<br />positions</small></span>
            <span><b>02</b><small>Continuous<br />curve alpha</small></span>
            <span><b>03</b><small>Atomic<br />route plans</small></span>
          </div>
        </div>

        <div className="landing-stage">
          <div className="hero-orbit orbit-one" />
          <div className="hero-orbit orbit-two" />
          <article className="hero-field-card">
            <header>
              <div><span className="token-pair-icon"><i>W</i><i>U</i></span><p><strong>WETH–USDC</strong><small>LIVE RANGE FIELD</small></p></div>
              <span className="hero-live"><i /> FIELD ACTIVE</span>
            </header>
            <div className="hero-canvas-wrap">
              <HeroCurveCanvas alpha={alpha} />
              <span className="hero-field-label buy">BUY RANGE</span>
              <span className="hero-field-label sell">SELL RANGE</span>
              <span className="hero-mid-label">INDEXED MID · 1,974.5</span>
            </div>
            <footer>
              <div className="hero-alpha-readout"><span>CURVE ALPHA</span><strong>{alpha > 0 ? '+' : ''}{alpha.toFixed(2)}</strong></div>
              <div className="hero-alpha-control">
                <input
                  type="range"
                  min="-20"
                  max="20"
                  step="0.01"
                  value={alpha}
                  onInput={(event) => setAlpha(Number((event.target as HTMLInputElement).value))}
                  aria-label="Landing curve alpha"
                />
                <div><span>−20</span><small>DRAG TO RESHAPE THE BOOK</small><span>+20</span></div>
              </div>
            </footer>
          </article>
          <div className="hero-floating-stat stat-top"><span>SPREAD</span><strong>{view.market.spreadBps} bps</strong></div>
          <div className="hero-floating-stat stat-bottom"><span>CURVES</span><strong>{view.market.stats.activePositions * 2} live</strong></div>
        </div>
      </section>

      <div className="landing-ticker" aria-hidden="true">
        <div>
          <span>SHAPE LIQUIDITY</span><i>◆</i><span>PUBLISH THE RANGE</span><i>◆</i><span>ROUTE THE FIELD</span><i>◆</i>
          <span>SHAPE LIQUIDITY</span><i>◆</i><span>PUBLISH THE RANGE</span><i>◆</i><span>ROUTE THE FIELD</span><i>◆</i>
        </div>
      </div>

      <section className="landing-principles">
        <div><span>01 / SHAPE</span><h2>Liquidity becomes a function.</h2><p>Choose two price endpoints, fund both sides and use alpha to shape how inventory is released.</p></div>
        <div><span>02 / PUBLISH</span><h2>The range becomes the order.</h2><p>Every maker position is transparent, bounded and ready to be composed into executable routes.</p></div>
        <div><span>03 / ROUTE</span><h2>The book moves with the fill.</h2><p>Inventory recycles between both sides while the marginal field advances deterministically.</p></div>
      </section>
    </main>
  )
}

function FreshnessBadge({ market }: { market: MarketDetail }) {
  return (
    <div className="freshness-badge" title={market.meta.warnings.join(' ')}>
      <span className="status-dot" />
      <strong>{market.meta.source}</strong>
      <span>block {numberFormatter.format(market.meta.indexedBlock ?? 0)}</span>
      <span>lag {market.meta.indexLag ?? '—'}</span>
    </div>
  )
}

function AppShell({
  activeView,
  onNavigate,
  walletAddress,
  onWalletToggle,
  bootstrap,
  children,
}: {
  activeView: AppView
  onNavigate: (view: AppView) => void
  walletAddress: string | null
  onWalletToggle: () => void
  bootstrap: FrontendBootstrap
  children: React.ReactNode
}) {
  const nav = [
    { id: 'trade' as const, label: 'Trade' },
    { id: 'portfolio' as const, label: 'Portfolio' },
    { id: 'studio' as const, label: 'Curve composer' },
  ]

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => onNavigate('home')} aria-label="ArcBook home">
          <span className="brand-mark"><i /><i /><i /></span>
          <span className="brand-lockup">
            <b>ARC<span>BOOK</span></b>
            <small>CURVE-NATIVE MARKETS</small>
          </span>
        </button>
        <nav className="desktop-nav" aria-label="Primary navigation">
          {nav.map((item) => (
            <button
              key={item.id}
              className={activeView === item.id ? 'active' : ''}
              onClick={() => onNavigate(item.id)}
              aria-current={activeView === item.id ? 'page' : undefined}
            >
              {item.label}
            </button>
          ))}
          <button className="muted-nav" disabled>Activity</button>
          <button className="muted-nav" disabled>Docs</button>
        </nav>
        <div className="topbar-actions">
          <span className="network-pill"><i className="status-dot" />{bootstrap.mode}</span>
          <button
            className={`wallet-button ${walletAddress === null ? '' : 'connected'}`}
            onClick={onWalletToggle}
            aria-pressed={walletAddress !== null}
            title={walletAddress === null
              ? 'Connect a wallet to reveal its portfolio.'
              : 'Disconnect this wallet from the application.'}
          >
            {walletAddress === null ? 'Connect' : <><i />{shortAddress(walletAddress)}</>}
          </button>
          <button className="icon-button" aria-label="Application settings">•••</button>
        </div>
      </header>
      {children}
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {nav.map((item) => (
          <button
            key={item.id}
            className={activeView === item.id ? 'active' : ''}
            onClick={() => onNavigate(item.id)}
          >
            <span>{item.id === 'trade' ? '↗' : item.id === 'portfolio' ? '⌁' : '+'}</span>
            {item.label === 'Curve composer' ? 'Compose' : item.label}
          </button>
        ))}
      </nav>
    </div>
  )
}

function MarketStrip({ view }: { view: GatewayView }) {
  const { market } = view
  return (
    <section className="market-strip" aria-label="Market summary">
      <div className="market-identity">
        <span className="token-pair-icon">
          <i>{market.baseToken.symbol.slice(0, 1)}</i>
          <i>{market.quoteToken.symbol.slice(0, 1)}</i>
        </span>
        <div>
          <strong>{market.baseToken.symbol}-{market.quoteToken.symbol}</strong>
          <small>CURVE MARKET / 01</small>
        </div>
        <button className="pair-switcher" aria-label="Change market">⌄</button>
      </div>
      <dl className="market-stats">
        <div><dt>Best bid</dt><dd className="positive">{market.bestBid?.formatted ?? '—'}</dd></div>
        <div><dt>Best ask</dt><dd className="negative">{market.bestAsk?.formatted ?? '—'}</dd></div>
        <div><dt>Spread</dt><dd>{market.spreadBps ?? '—'} bps</dd></div>
        <div><dt>24h volume</dt><dd>${market.stats.volumeQuote24h.formatted}</dd></div>
        <div><dt>Active curves</dt><dd>{market.stats.activeBuySides + market.stats.activeSellSides}</dd></div>
        <div><dt>24h fills</dt><dd>{market.stats.fillCount24h}</dd></div>
      </dl>
      <FreshnessBadge market={market} />
    </section>
  )
}

function FunctionalOrderBook({
  positions,
  selectedId,
  onSelect,
  mode,
}: {
  positions: PositionSummary[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  mode: FrontendBootstrap['mode']
}) {
  const rows = [
    ...positions.map((position, index) => ({ position, index, side: 'sell' as const })),
    ...positions.map((position, index) => ({ position, index, side: 'buy' as const })),
  ].sort((left, right) => {
    const leftPrice = Number(left.position[left.side].runtime.currentMarginalPrice.formatted)
    const rightPrice = Number(right.position[right.side].runtime.currentMarginalPrice.formatted)
    return rightPrice - leftPrice
  })

  return (
    <section className="orderbook panel">
      <header className="panel-header">
        <div><h2>Curve book</h2><span className="live-label"><i /> {mode}</span></div>
        <button className="density-button" aria-label="Book display settings">≡</button>
      </header>
      <div className="book-columns"><span>Marginal</span><span>Available</span><span>Range / α</span></div>
      <div className="book-rows">
        {rows.map(({ position, index, side }) => {
          const curve = position[side]
          const seriesId = `${position.id}-${side}`
          return (
            <button
              key={seriesId}
              className={`book-row ${side} ${selectedId === seriesId ? 'selected' : ''}`}
              onMouseEnter={() => onSelect(seriesId)}
              onFocus={() => onSelect(seriesId)}
              onMouseLeave={() => onSelect(null)}
            >
              <span><strong>{curve.runtime.currentMarginalPrice.formatted}</strong><small>P{index + 1} · {side}</small></span>
              <span><strong>{curve.runtime.availableOutput.formatted}</strong><small>{curve.runtime.availableOutput.token.symbol}</small></span>
              <span><strong>{curve.policy.startPrice.formatted} → {curve.policy.endPrice.formatted}</strong><small>α {curve.policy.alpha}</small></span>
              <i className="book-depth" style={{ width: `${Math.max(18, 94 - curve.runtime.progressBps / 130)}%` }} />
            </button>
          )
        })}
      </div>
      <footer className="book-footer"><span>{rows.length} executable sides</span><span>Sorted by marginal price</span></footer>
    </section>
  )
}

function TradeTicket({
  view,
  quote,
  quoteError,
  quoteLoading,
  amount,
  setAmount,
  side,
  setSide,
  kind,
  setKind,
  slippageBps,
  setSlippageBps,
  walletAddress,
  operation,
  onExecute,
}: {
  view: GatewayView
  quote: RouteQuote | null
  quoteError: string | null
  quoteLoading: boolean
  amount: string
  setAmount: (amount: string) => void
  side: CurveSide
  setSide: (side: CurveSide) => void
  kind: 'exact-input' | 'exact-output'
  setKind: (kind: 'exact-input' | 'exact-output') => void
  slippageBps: number
  setSlippageBps: (slippage: number) => void
  walletAddress: Address | null
  operation: OperationState
  onExecute: () => void
}) {
  const payToken = side === 'sell' ? view.market.quoteToken : view.market.baseToken
  const receiveToken = side === 'sell' ? view.market.baseToken : view.market.quoteToken
  const fixedToken = kind === 'exact-input' ? payToken : receiveToken

  return (
    <aside className="trade-ticket panel">
      <div className="ticket-mode-tabs" role="tablist" aria-label="Trade direction">
        <button className={side === 'sell' ? 'active' : ''} onClick={() => setSide('sell')} role="tab" aria-selected={side === 'sell'}>
          Pay {view.market.quoteToken.symbol}
        </button>
        <button className={side === 'buy' ? 'active' : ''} onClick={() => setSide('buy')} role="tab" aria-selected={side === 'buy'}>
          Pay {view.market.baseToken.symbol}
        </button>
      </div>

      <div className="ticket-body">
        <div className="segmented-control">
          <button className={kind === 'exact-input' ? 'active' : ''} onClick={() => setKind('exact-input')}>Exact pay</button>
          <button className={kind === 'exact-output' ? 'active' : ''} onClick={() => setKind('exact-output')}>Exact receive</button>
        </div>

        <label className="amount-field">
          <span>{kind === 'exact-input' ? 'You pay' : 'You receive'}</span>
          <div>
            <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" aria-label={`${kind === 'exact-input' ? 'Pay' : 'Receive'} amount`} />
            <strong>{fixedToken.symbol}</strong>
          </div>
          <small>Available 0.00 {fixedToken.symbol}</small>
        </label>

        <div className="route-arrow" aria-hidden="true">↓</div>
        <div className="receive-card">
          <span>{kind === 'exact-input' ? 'You receive' : 'Maximum pay'}</span>
          <strong className={quoteLoading ? 'loading-value' : ''}>
            {kind === 'exact-input' ? quote?.amountOut.formatted ?? '—' : quote?.limit.formatted ?? '—'}
          </strong>
          <small>{kind === 'exact-input' ? receiveToken.symbol : payToken.symbol}</small>
        </div>

        {quoteError !== null ? <div className="inline-error" role="alert">{quoteError}</div> : null}

        <div className="ticket-detail-grid">
          <span>Effective price</span><strong>{quote?.displayedEffectivePrice.formatted ?? '—'}</strong>
          <span>Worst marginal</span><strong>{quote?.worstMarginalPrice.formatted ?? '—'}</strong>
          <span>Price impact</span><strong>{quote === null ? '—' : `${quote.priceImpactBps} bps`}</strong>
          <span>Slippage</span>
          <select value={slippageBps} onChange={(event) => setSlippageBps(Number(event.target.value))} aria-label="Maximum slippage">
            <option value={10}>0.10%</option><option value={50}>0.50%</option><option value={100}>1.00%</option>
          </select>
        </div>

        <button
          className="primary-action"
          disabled={!view.bootstrap.features.executeRoutes || quote === null || quoteLoading || operation.running}
          title={view.bootstrap.features.executeRoutes ? 'Simulate the final route and submit it to your wallet.' : 'Execution is disabled in this environment.'}
          onClick={onExecute}
        >
          {operation.running ? operation.message ?? 'Executing…' : walletAddress === null ? 'Connect & execute' : 'Execute route'}
        </button>
        {operation.error !== null ? <div className="inline-error" role="alert">{operation.error}</div> : null}
        {operation.error === null && operation.message !== null ? <div className="execution-message">{operation.message}</div> : null}
        <div className="execution-safety">
          <span><i className="status-dot" /> Simulation {quote?.simulation.status ?? 'pending'}</span>
          <span>{quote?.fills.length ?? 0} maker fills</span>
        </div>

        {quote !== null ? (
          <div className="route-splits">
            <h3>Route split</h3>
            {quote.fills.map((fill) => (
              <div key={`${fill.positionId}-${fill.index}`}>
                <span><i style={{ width: `${fill.index === 0 ? 60 : 40}%` }} />{shortAddress(fill.maker)}</span>
                <strong>{fill.amountOut.formatted} {fill.amountOut.token.symbol}</strong>
                <small>v{fill.expectedVersion}</small>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <footer className="ticket-footer"><span>Source {quote?.meta.source ?? 'solver'}</span><span>Index lag {quote?.meta.indexLag ?? '—'} blocks</span></footer>
    </aside>
  )
}

function PositionTabs({ view, quote }: { view: GatewayView; quote: RouteQuote | null }) {
  const [tab, setTab] = useState<'positions' | 'route' | 'activity'>('positions')
  return (
    <section className="position-dock panel">
      <div className="dock-tabs" role="tablist">
        <button className={tab === 'positions' ? 'active' : ''} onClick={() => setTab('positions')} role="tab">Positions <span>{view.positions.length}</span></button>
        <button className={tab === 'route' ? 'active' : ''} onClick={() => setTab('route')} role="tab">Current route <span>{quote?.fills.length ?? 0}</span></button>
        <button className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')} role="tab">Activity <span>{view.activity.length}</span></button>
      </div>
      {tab === 'positions' ? (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>Position</th><th>Maker</th><th>Bid marginal</th><th>Ask marginal</th><th>Buy capacity</th><th>Sell capacity</th><th>Backing</th><th>Version</th></tr></thead>
            <tbody>
              {view.positions.map((position, index) => (
                <tr key={position.id}>
                  <td><strong>P{index + 1}</strong> <small>{shortId(position.id)}</small></td>
                  <td>{shortAddress(position.maker)}</td>
                  <td className="positive">{position.buy.runtime.currentMarginalPrice.formatted}</td>
                  <td className="negative">{position.sell.runtime.currentMarginalPrice.formatted}</td>
                  <td>{position.buy.runtime.availableOutput.formatted} {position.buy.runtime.availableOutput.token.symbol}</td>
                  <td>{position.sell.runtime.availableOutput.formatted} {position.sell.runtime.availableOutput.token.symbol}</td>
                  <td><span className="backed-pill"><i /> Backed</span></td>
                  <td>v{position.runtimeVersion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {tab === 'route' ? (
        <div className="route-detail-table">
          {quote === null ? <div className="empty-state">Enter an amount to preview a solver route.</div> : quote.fills.map((fill, index) => (
            <article key={`${fill.positionId}-${fill.index}`}>
              <span className="route-order">0{index + 1}</span>
              <div><strong>{shortAddress(fill.maker)}</strong><small>{fill.amountIn.formatted} {fill.amountIn.token.symbol} paid</small></div>
              <div><span>Marginal move</span><strong>{fill.displayedPriceBefore.formatted} → {fill.displayedPriceAfter.formatted}</strong></div>
              <div><span>Opposite side credit</span><strong>+{fill.oppositeInventoryCredit.formatted} {fill.oppositeInventoryCredit.token.symbol}</strong></div>
            </article>
          ))}
        </div>
      ) : null}
      {tab === 'activity' ? (
        <div className="activity-list">
          {view.activity.map((item) => (
            <article key={item.id}>
              <span className="activity-icon">↗</span>
              <div><strong>{item.type.replaceAll('-', ' ')}</strong><small>Block {numberFormatter.format(item.blockNumber)}</small></div>
              <div><strong>{item.amountIn?.formatted ?? '—'} {item.amountIn?.token.symbol ?? ''}</strong><small>→ {item.amountOut?.formatted ?? '—'} {item.amountOut?.token.symbol ?? ''}</small></div>
              <time>{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function TradeView({
  view,
  quote,
  quoteError,
  quoteLoading,
  amount,
  setAmount,
  side,
  setSide,
  kind,
  setKind,
  slippageBps,
  setSlippageBps,
  walletAddress,
  operation,
  onExecute,
}: {
  view: GatewayView
  quote: RouteQuote | null
  quoteError: string | null
  quoteLoading: boolean
  amount: string
  setAmount: (amount: string) => void
  side: CurveSide
  setSide: (side: CurveSide) => void
  kind: 'exact-input' | 'exact-output'
  setKind: (kind: 'exact-input' | 'exact-output') => void
  slippageBps: number
  setSlippageBps: (slippage: number) => void
  walletAddress: Address | null
  operation: OperationState
  onExecute: () => void
}) {
  const [selectedCurve, setSelectedCurve] = useState<string | null>(null)
  const [chartMode, setChartMode] = useState<'liquidity' | 'route'>('liquidity')
  const routePositionIds = new Set(quote?.fills.map((fill) => fill.positionId) ?? [])
  const chartPositions = chartMode === 'route' && quote !== null
    ? view.positions.filter((position) => routePositionIds.has(position.id))
    : view.positions
  const chartSeries = seriesFromPositions(chartPositions, chartMode === 'route' ? side : 'all')

  return (
    <>
      <MarketStrip view={view} />
      <main className="trade-workspace">
        <section className="trade-chart panel">
          <header className="panel-header chart-panel-header">
            <div className="panel-tabs">
              <button className={chartMode === 'liquidity' ? 'active' : ''} onClick={() => setChartMode('liquidity')}>Curve field</button>
              <button className={chartMode === 'route' ? 'active' : ''} onClick={() => setChartMode('route')}>Route geometry</button>
            </div>
            <div className="chart-tools"><button className="active">Range depth</button><button disabled>Execution</button><button aria-label="Expand chart">⛶</button></div>
          </header>
          <CurveChart series={chartSeries} market={view.market} selectedId={selectedCurve} onSelect={setSelectedCurve} />
        </section>
        <FunctionalOrderBook positions={view.positions} selectedId={selectedCurve} onSelect={setSelectedCurve} mode={view.bootstrap.mode} />
        <TradeTicket
          view={view}
          quote={quote}
          quoteError={quoteError}
          quoteLoading={quoteLoading}
          amount={amount}
          setAmount={setAmount}
          side={side}
          setSide={setSide}
          kind={kind}
          setKind={setKind}
          slippageBps={slippageBps}
          setSlippageBps={setSlippageBps}
          walletAddress={walletAddress}
          operation={operation}
          onExecute={onExecute}
        />
      </main>
      <PositionTabs view={view} quote={quote} />
    </>
  )
}

function MetricCard({
  label,
  value,
  detail,
  accent,
}: {
  label: string
  value: string
  detail: string
  accent?: 'buy' | 'sell'
}) {
  return (
    <article className={`metric-card ${accent === undefined ? '' : `metric-${accent}`}`}>
      <span>{label}</span><strong>{value}</strong><small>{detail}</small>
    </article>
  )
}

function PortfolioView({
  view,
  onNavigate,
  walletAddress,
  onConnect,
  operation,
  onDock,
}: {
  view: GatewayView
  onNavigate: (view: AppView) => void
  walletAddress: string | null
  onConnect: () => void
  operation: OperationState
  onDock: (position: PositionSummary) => void
}) {
  const [filter, setFilter] = useState<CurveFilter>('all')
  const [selectedCurve, setSelectedCurve] = useState<string | null>(null)
  const [selectedPosition, setSelectedPosition] = useState<string | null>(null)
  const walletPositions = walletAddress === null
    ? []
    : view.positions.filter((position) => (
      position.maker.toLowerCase() === walletAddress.toLowerCase()
    ))
  const walletActivity = walletAddress === null
    ? []
    : view.activity.filter((item) => (
      item.maker?.toLowerCase() === walletAddress.toLowerCase()
    ))
  const totalBuy = walletPositions.reduce((total, position) => total + Number(position.buy.runtime.availableOutput.formatted), 0)
  const totalSell = walletPositions.reduce((total, position) => total + Number(position.sell.runtime.availableOutput.formatted), 0)
  const routedVolume = walletActivity.reduce((total, item) => (
    total + (item.amountIn?.token.symbol === view.market.quoteToken.symbol
      ? Number(item.amountIn.formatted)
      : 0)
  ), 0)
  const chartSeries = seriesFromPositions(walletPositions, filter)
  const selectedSeriesId = selectedCurve ?? (selectedPosition === null ? null : `${selectedPosition}-sell`)

  if (walletAddress === null) {
    return (
      <main className="wallet-gate">
        <section className="wallet-gate-card panel">
          <span className="wallet-gate-icon" aria-hidden="true"><i /></span>
          <span className="eyebrow">WALLET REQUIRED / PRIVATE VIEW</span>
          <h1>Your liquidity, tied to your address.</h1>
          <p>Connect a wallet to resolve its positions, inventory ranges and maker activity. Until then, no portfolio data is displayed.</p>
          <button className="primary-small wallet-gate-action" onClick={onConnect}>Connect wallet</button>
          <small>{view.bootstrap.mode === 'mock' ? 'Demo mode connects a seeded maker address.' : `Transactions target ${view.bootstrap.network.name}.`}</small>
        </section>
      </main>
    )
  }

  return (
    <main className="page portfolio-page">
      <header className="page-heading">
        <div><span className="eyebrow">POSITION GEOMETRY / 01</span><h1>Portfolio</h1><p>Every live curve, range and inventory state for <b className="wallet-context">{shortAddress(walletAddress)}</b>.</p></div>
        <div className="page-actions"><button className="secondary-action">Export activity</button><button className="primary-small" onClick={() => onNavigate('studio')}>+ New position</button></div>
      </header>

      <section className="portfolio-metrics">
        <MetricCard label="Active positions" value={String(walletPositions.length)} detail={`${walletPositions.length * 2} executable curve sides`} />
        <MetricCard label="Quote inventory" value={`${formatNumber(totalBuy, 0)} ${view.market.quoteToken.symbol}`} detail="Available across buy curves" accent="buy" />
        <MetricCard label="Base inventory" value={`${formatNumber(totalSell, 2)} ${view.market.baseToken.symbol}`} detail="Available across sell curves" accent="sell" />
        <MetricCard label="Wallet routed volume" value={`$${formatNumber(routedVolume, 0)}`} detail={`${walletActivity.length} wallet-linked event${walletActivity.length === 1 ? '' : 's'}`} />
      </section>

      <section className="portfolio-chart panel">
        <header className="panel-header portfolio-chart-header">
          <div><h2>Liquidity atlas</h2><p>Inventory distribution across every position’s own price range.</p></div>
          <div className="segmented-control compact">
            {(['all', 'buy', 'sell'] as CurveFilter[]).map((item) => (
              <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>
                {item === 'all' ? 'All curves' : `${item} side`}
              </button>
            ))}
          </div>
        </header>
        <CurveChart series={chartSeries} market={view.market} selectedId={selectedSeriesId} onSelect={setSelectedCurve} compact />
      </section>

      <section className="portfolio-positions panel">
        <header className="panel-header">
          <div><h2>Positions</h2><span className="subtle-count">{walletPositions.length} total</span></div>
          <div className="table-actions"><button>All markets</button><button>Active</button><button aria-label="Position table settings">≡</button></div>
        </header>
        <div className="data-table-wrap">
          <table className="data-table portfolio-table">
            <thead><tr><th>Position</th><th>Buy curve</th><th>Sell curve</th><th>Available</th><th>Progress</th><th>Backing</th><th>Updated</th><th /></tr></thead>
            <tbody>
              {walletPositions.map((position, index) => (
                <tr
                  key={position.id}
                  className={selectedPosition === position.id ? 'selected-row' : ''}
                  onMouseEnter={() => setSelectedPosition(position.id)}
                  onMouseLeave={() => setSelectedPosition(null)}
                >
                  <td><div className="position-name"><span>P{index + 1}</span><strong>{view.market.baseToken.symbol}/{view.market.quoteToken.symbol}</strong><small>{shortAddress(position.maker)} · v{position.runtimeVersion}</small></div></td>
                  <td><strong className="positive">{position.buy.policy.startPrice.formatted} → {position.buy.policy.endPrice.formatted}</strong><small>α {position.buy.policy.alpha} · {branchLabel(position.buy.policy.branch)}</small></td>
                  <td><strong className="negative">{position.sell.policy.startPrice.formatted} → {position.sell.policy.endPrice.formatted}</strong><small>α {position.sell.policy.alpha} · {branchLabel(position.sell.policy.branch)}</small></td>
                  <td><strong>{position.buy.runtime.availableOutput.formatted} {view.market.quoteToken.symbol}</strong><small>{position.sell.runtime.availableOutput.formatted} {view.market.baseToken.symbol}</small></td>
                  <td>
                    <div className="dual-progress"><span><i style={{ width: `${position.buy.runtime.progressBps / 100}%` }} /></span><span><i style={{ width: `${position.sell.runtime.progressBps / 100}%` }} /></span></div>
                    <small>{formatNumber(position.buy.runtime.progressBps / 100, 1)}% / {formatNumber(position.sell.runtime.progressBps / 100, 1)}%</small>
                  </td>
                  <td><span className="backed-pill"><i /> Backed</span></td>
                  <td><strong>Block {numberFormatter.format(position.lastUpdateBlock)}</strong><small>{view.market.meta.indexLag} block lag</small></td>
                  <td>
                    <button
                      className="row-menu"
                      aria-label={`Dock position P${index + 1}`}
                      title="Dock position and release both Aqua allocations"
                      disabled={operation.running || position.lifecycle !== 'active'}
                      onClick={() => onDock(position)}
                    >Dock</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="portfolio-bottom-grid">
        <article className="recycling-card panel">
          <header><div><span className="eyebrow">FLOW ENGINE / 02</span><h2>Inventory recycling</h2></div><span className="live-label"><i /> active</span></header>
          <div className="recycling-flow">
            <div><span className="token-orb weth">W</span><strong>Sell WETH</strong><small>Maker releases base</small></div>
            <span className="flow-arrow"><i />USDC received<b>→</b></span>
            <div><span className="token-orb usdc">$</span><strong>Fund buy curve</strong><small>Marginal price preserved</small></div>
          </div>
        </article>
        <article className="recent-activity-card panel">
          <header><h2>Recent activity</h2><button>View all</button></header>
          {walletActivity.map((item) => (
            <div key={item.id}>
              <span className="activity-icon">↗</span>
              <p><strong>{item.type.replaceAll('-', ' ')}</strong><small>{shortId(item.transactionHash)}</small></p>
              <time>{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
            </div>
          ))}
        </article>
      </section>
    </main>
  )
}

function CurveEditor({
  side,
  value,
  onChange,
  preview,
  baseSymbol,
  quoteSymbol,
}: {
  side: CurveSide
  value: CurveDraft
  onChange: (field: keyof CurveDraft, value: string) => void
  preview: PositionPreview | null
  baseSymbol: string
  quoteSymbol: string
}) {
  const sideIssues = preview?.issues.filter((issue) => issue.path.startsWith(`${side}.`)) ?? []
  const branch = preview?.[side]?.branch
  const reserveSymbol = preview?.[side]?.initialReserve.token.symbol

  return (
    <section className={`curve-editor curve-editor-${side}`}>
      <header>
        <div><span className={`side-indicator ${side}`} /><h2>{side === 'sell' ? 'Sell curve' : 'Buy curve'}</h2><small>{side === 'sell' ? `Release ${baseSymbol} · receive ${quoteSymbol}` : `Release ${quoteSymbol} · receive ${baseSymbol}`}</small></div>
        <span className="branch-pill">{branch === undefined ? '—' : branchLabel(branch)}</span>
      </header>
      <div className="field-pair">
        <label><span>Start price</span><div><input value={value.startPrice} onChange={(event) => onChange('startPrice', event.target.value)} inputMode="decimal" /><small>{quoteSymbol}</small></div></label>
        <label><span>End price</span><div><input value={value.endPrice} onChange={(event) => onChange('endPrice', event.target.value)} inputMode="decimal" /><small>{quoteSymbol}</small></div></label>
      </div>
      <label className="reserve-field"><span>Initial outgoing reserve</span><div><input value={value.initialReserve} onChange={(event) => onChange('initialReserve', event.target.value)} inputMode="decimal" /><small>{reserveSymbol ?? (side === 'sell' ? baseSymbol : quoteSymbol)}</small></div></label>
      <div className="alpha-control">
        <div className="alpha-heading">
          <div><span>Curve alpha</span><small>Shapes price distribution; endpoints remain fixed.</small></div>
          <label>
            <span className="sr-only">Alpha value</span>
            <input
              type="number"
              step="0.01"
              value={value.alpha}
              onChange={(event) => onChange('alpha', event.target.value)}
              inputMode="decimal"
              aria-label={`${side} alpha value`}
            />
          </label>
        </div>
        <input
          className={`alpha-slider slider-${side}`}
          type="range"
          min="-20"
          max="20"
          step="0.01"
          value={Math.max(-20, Math.min(20, Number(value.alpha) || 0))}
          onInput={(event) => onChange(
            'alpha',
            (event.target as HTMLInputElement).value,
          )}
          aria-label={`${side} curve alpha`}
        />
        <div className="alpha-scale"><span>-20 quick range</span><span>0</span><span>+20 quick range</span></div>
        <div className="alpha-presets">
          {[-20, -10, 0, 10, 20].map((preset) => (
            <button key={preset} className={Number(value.alpha) === preset ? 'active' : ''} onClick={() => onChange('alpha', String(preset))} type="button">
              {preset > 0 ? `+${preset}` : preset}
            </button>
          ))}
        </div>
      </div>
      {sideIssues.map((issue) => <div className={`editor-issue ${issue.severity}`} key={`${issue.path}-${issue.code}`}>{issue.message}</div>)}
    </section>
  )
}

function PublishReview({
  preview,
  plan,
  loading,
  onClose,
  operation,
  onExecute,
}: {
  preview: PositionPreview
  plan: TransactionPlan | null
  loading: boolean
  onClose: () => void
  operation: OperationState
  onExecute: () => void
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="review-modal" role="dialog" aria-modal="true" aria-labelledby="review-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span className="eyebrow">Immutable policy review</span><h2 id="review-title">Publish position</h2></div><button onClick={onClose} aria-label="Close review">×</button></header>
        <div className="review-summary">
          <div><span>Initial spread</span><strong>{preview.initialSpreadBps ?? '—'} bps</strong></div>
          <div><span>Sell reserve</span><strong>{preview.sell?.initialReserve.formatted} {preview.sell?.initialReserve.token.symbol}</strong></div>
          <div><span>Buy reserve</span><strong>{preview.buy?.initialReserve.formatted} {preview.buy?.initialReserve.token.symbol}</strong></div>
        </div>
        <div className="immutable-warning"><strong>This policy cannot be edited after publication.</strong><span>Changing its curves requires docking and publishing a new salted strategy.</span></div>
        <div className="transaction-steps">
          <h3>Prepared transaction plan</h3>
          {loading ? <div className="plan-loading">Preparing ordered steps…</div> : null}
          {plan?.steps.map((step, index) => (
            <article key={step.id}><span>{index + 1}</span><div><strong>{step.title}</strong><small>{step.description}</small></div><b>{step.expectedEvent}</b></article>
          ))}
        </div>
        <button
          className="primary-action"
          disabled={plan?.sendable !== true || loading || operation.running}
          onClick={onExecute}
        >
          {operation.running ? operation.message ?? 'Publishing…' : plan?.sendable === true ? 'Sign & publish position' : 'Wallet sending disabled'}
        </button>
        {operation.error !== null ? <div className="inline-error" role="alert">{operation.error}</div> : null}
        <small className="modal-footnote">Each step is enabled only after the previous transaction receipt is confirmed.</small>
      </section>
    </div>
  )
}

function MakerStudio({
  view,
  onNavigate,
  walletAddress,
  onConnect,
  operation,
  onExecutePlan,
}: {
  view: GatewayView
  onNavigate: (view: AppView) => void
  walletAddress: Address | null
  onConnect: ConnectWallet
  operation: OperationState
  onExecutePlan: ExecutePlan
}) {
  const [draft, setDraft] = useState<PositionDraft>({
    baseToken: view.market.baseToken,
    quoteToken: view.market.quoteToken,
    sell: { startPrice: '2004', endPrice: '2350', alpha: '2', initialReserve: '6' },
    buy: { startPrice: '1945', endPrice: '1550', alpha: '0', initialReserve: '12000' },
  })
  const [preview, setPreview] = useState<PositionPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(true)
  const [chartSide, setChartSide] = useState<CurveFilter>('all')
  const [reviewOpen, setReviewOpen] = useState(false)
  const [plan, setPlan] = useState<TransactionPlan | null>(null)
  const [planLoading, setPlanLoading] = useState(false)
  const [planError, setPlanError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setPreviewLoading(true)
    protocolClient.previewPosition(draft, { signal: controller.signal })
      .then(setPreview)
      .catch(() => {
        if (!controller.signal.aborted) setPreview(null)
      })
      .finally(() => {
        if (!controller.signal.aborted) setPreviewLoading(false)
      })
    return () => {
      controller.abort()
    }
  }, [draft])

  const updateCurve = (side: CurveSide, field: keyof CurveDraft, value: string) => {
    setDraft((current) => ({ ...current, [side]: { ...current[side], [field]: value } }))
  }

  const previewSeries = useMemo(() => {
    if (preview === null) return []
    const sides: CurveSide[] = chartSide === 'all' ? ['buy', 'sell'] : [chartSide]
    return sides.flatMap((side) => {
      const curve = preview[side]
      if (curve === null) return []
      return [{
        id: `draft-${side}`,
        side,
        label: `Draft ${side}`,
        samples: curve.marginalSamples,
        reserveLabel: `${curve.initialReserve.formatted} ${curve.initialReserve.token.symbol}`,
        draft: true,
      }]
    })
  }, [preview, chartSide])

  const openReview = async () => {
    if (preview === null || !preview.canPublish) return
    const maker = walletAddress ?? await onConnect()
    if (maker === null) return
    setReviewOpen(true)
    setPlan(null)
    setPlanError(null)
    setPlanLoading(true)
    try {
      const prepared = await protocolClient.preparePublish({ maker, draft })
      setPlan(prepared)
    } catch (caught) {
      setPlanError(caught instanceof Error ? caught.message : 'Could not prepare the publication plan.')
    } finally {
      setPlanLoading(false)
    }
  }

  return (
    <main className="studio-page">
      <header className="studio-topline">
        <div><button className="back-button" onClick={() => onNavigate('portfolio')}>←</button><div><span className="eyebrow">CURVE COMPOSER / NEW STRATEGY</span><h1>{view.market.baseToken.symbol}-{view.market.quoteToken.symbol}</h1></div></div>
        <div className="studio-status">
          <span className={preview?.canPublish === true ? 'valid' : ''}><i />{previewLoading ? 'Calculating preview' : preview?.canPublish === true ? 'Draft valid' : 'Needs attention'}</span>
          <FreshnessBadge market={view.market} />
        </div>
      </header>

      <div className="studio-workspace">
        <section className="studio-visual panel">
          <header className="panel-header">
            <div className="panel-tabs"><button className="active">Shape field</button><button disabled>Execution curve</button><button disabled>Previous vs draft</button></div>
            <div className="segmented-control compact">
              {(['all', 'buy', 'sell'] as CurveFilter[]).map((item) => (
                <button key={item} className={chartSide === item ? 'active' : ''} onClick={() => setChartSide(item)}>{item === 'all' ? 'Both' : item}</button>
              ))}
            </div>
          </header>
          {previewSeries.length > 0 ? <CurveChart series={previewSeries} market={view.market} /> : <div className="chart-empty"><strong>Enter a valid range to generate the curve.</strong><span>Errors are shown next to the affected parameter.</span></div>}
          <div className="studio-chart-summary">
            <div><span>Indexed bid / ask</span><strong><b className="positive">{view.market.bestBid?.formatted}</b><i> / </i><b className="negative">{view.market.bestAsk?.formatted}</b></strong></div>
            <div><span>Initial spread</span><strong>{preview?.initialSpreadBps ?? '—'} bps</strong></div>
            <div><span>Buy range</span><strong className="positive">{preview?.buy === null || preview?.buy === undefined ? '—' : `${preview.buy.startPrice.formatted} → ${preview.buy.endPrice.formatted}`}</strong></div>
            <div><span>Sell range</span><strong className="negative">{preview?.sell === null || preview?.sell === undefined ? '—' : `${preview.sell.startPrice.formatted} → ${preview.sell.endPrice.formatted}`}</strong></div>
          </div>
        </section>

        <aside className="studio-controls panel">
          <header className="controls-header"><div><h2>Position configuration</h2><p>Two independently shaped, self-recycling sides.</p></div><span className="mode-tag">Draft</span></header>
          <CurveEditor side="sell" value={draft.sell} onChange={(field, value) => updateCurve('sell', field, value)} preview={preview} baseSymbol={view.market.baseToken.symbol} quoteSymbol={view.market.quoteToken.symbol} />
          <CurveEditor side="buy" value={draft.buy} onChange={(field, value) => updateCurve('buy', field, value)} preview={preview} baseSymbol={view.market.baseToken.symbol} quoteSymbol={view.market.quoteToken.symbol} />
          {preview?.issues.filter((issue) => issue.path === 'market').map((issue) => <div className={`editor-issue market-issue ${issue.severity}`} key={issue.code}>{issue.message}</div>)}
          <div className="publish-summary">
            <div><span>Policy</span><strong>Immutable after publish</strong></div>
            <div><span>Required approvals</span><strong>2 assets</strong></div>
            <div><span>Network</span><strong>{view.bootstrap.network.name}</strong></div>
          </div>
          <button className="primary-action publish-button" disabled={preview?.canPublish !== true || previewLoading} onClick={() => void openReview()}>Review position</button>
          <p className="control-footnote">The field maps remaining inventory against each side’s exact compiled price range.</p>
        </aside>
      </div>

      {reviewOpen && preview !== null ? (
        <PublishReview
          preview={preview}
          plan={plan}
          loading={planLoading}
          operation={{ ...operation, error: planError ?? operation.error }}
          onExecute={() => {
            if (plan !== null) void onExecutePlan(plan)
          }}
          onClose={() => setReviewOpen(false)}
        />
      ) : null}
    </main>
  )
}

function LoadingScreen() {
  return (
    <main className="loading-screen">
      <span className="brand-mark large"><i /><i /><i /></span>
      <div><strong>ArcBook</strong><span>Loading protocol state</span></div>
      <i className="loading-bar" />
    </main>
  )
}

async function loadGateway(signal?: AbortSignal): Promise<GatewayView> {
  const options = signal === undefined ? {} : { signal }
  const bootstrap = await protocolClient.getBootstrap(options)
  const markets = await protocolClient.listMarkets({}, options)
  const firstMarket = markets.items[0]
  if (firstMarket === undefined) throw new Error('No market is available.')
  const [market, positions, activity] = await Promise.all([
    protocolClient.getMarket(firstMarket.id, options),
    protocolClient.listPositions({ marketId: firstMarket.id }, options),
    protocolClient.listActivity({ marketId: firstMarket.id }, options),
  ])
  return { bootstrap, market, positions: positions.items, activity: activity.items }
}

function App() {
  const [activeView, setActiveView] = useState<AppView>(getInitialView)
  const [view, setView] = useState<GatewayView | null>(null)
  const [walletAddress, setWalletAddress] = useState<Address | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [quote, setQuote] = useState<RouteQuote | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [amount, setAmount] = useState('1000')
  const [side, setSide] = useState<CurveSide>('sell')
  const [kind, setKind] = useState<'exact-input' | 'exact-output'>('exact-input')
  const [slippageBps, setSlippageBps] = useState(50)
  const [operation, setOperation] = useState<OperationState>({ running: false, message: null, error: null })

  useEffect(() => {
    const controller = new AbortController()
    loadGateway(controller.signal).then(setView).catch((caught) => {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Frontend gateway failed.')
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (view?.bootstrap.mode !== 'live') return
    let active = true
    currentInjectedAccount().then((account) => {
      if (active) setWalletAddress(account)
    }).catch(() => undefined)
    const unwatch = watchInjectedWallet(
      (account) => setWalletAddress(account),
      () => setWalletAddress(null),
    )
    return () => {
      active = false
      unwatch()
    }
  }, [view?.bootstrap.mode])

  useEffect(() => {
    if (view === null) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      try {
        const payToken = side === 'sell' ? view.market.quoteToken : view.market.baseToken
        const receiveToken = side === 'sell' ? view.market.baseToken : view.market.quoteToken
        const fixedToken = kind === 'exact-input' ? payToken : receiveToken
        const raw = parseUnits(amount, fixedToken.decimals)
        if (BigInt(raw) <= 0n) throw new Error('Enter a positive amount.')
        setQuoteLoading(true)
        setQuoteError(null)
        protocolClient.quote({
          marketId: view.market.id,
          side,
          kind,
          amount: { token: fixedToken.address, raw },
          slippageBps,
          ...(walletAddress === null ? {} : { recipient: walletAddress }),
        }, { signal: controller.signal }).then(setQuote).catch((caught) => {
          if (!controller.signal.aborted) {
            setQuote(null)
            setQuoteError(caught instanceof Error ? caught.message : 'Quote unavailable.')
          }
        }).finally(() => {
          if (!controller.signal.aborted) setQuoteLoading(false)
        })
      } catch (caught) {
        setQuote(null)
        setQuoteLoading(false)
        setQuoteError(caught instanceof Error ? caught.message : 'Invalid amount.')
      }
    }, 180)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [view, amount, side, kind, slippageBps, walletAddress])

  const navigate = (nextView: AppView) => {
    setActiveView(nextView)
    window.history.pushState({}, '', `#/${nextView}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  useEffect(() => {
    const onPopState = () => setActiveView(getInitialView())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const connectWallet: ConnectWallet = async () => {
    if (view === null) return null
    if (walletAddress !== null) return walletAddress
    try {
      const account = view.bootstrap.mode === 'mock'
        ? view.positions[0]?.maker ?? null
        : await connectInjectedWallet(view.bootstrap)
      setWalletAddress(account)
      setOperation((current) => ({ ...current, error: null }))
      return account
    } catch (caught) {
      setOperation({ running: false, message: null, error: caught instanceof Error ? caught.message : 'Wallet connection failed.' })
      return null
    }
  }

  const submitPlan = async (plan: TransactionPlan, account: Address) => {
    if (view === null) return
    setOperation({ running: true, message: 'Waiting for wallet…', error: null })
    try {
      const hashes = await executeTransactionPlan(plan, account, view.bootstrap, (progressValue) => {
        const position = `${progressValue.index + 1}/${progressValue.total}`
        const phase = progressValue.state === 'awaiting-signature' ? 'Sign' : progressValue.state === 'confirming' ? 'Confirming' : 'Confirmed'
        setOperation({ running: true, message: `${phase} ${position}: ${progressValue.step.title}`, error: null })
      })
      setOperation({ running: true, message: 'Refreshing indexed protocol state…', error: null })
      setView(await loadGateway())
      setOperation({ running: false, message: `${hashes.length} transaction${hashes.length === 1 ? '' : 's'} confirmed.`, error: null })
    } catch (caught) {
      setOperation({ running: false, message: null, error: caught instanceof Error ? caught.message : 'Transaction failed.' })
    }
  }

  const executePlan: ExecutePlan = async (plan) => {
    const account = walletAddress ?? await connectWallet()
    if (account !== null) await submitPlan(plan, account)
  }

  const executeQuote = async () => {
    if (view === null || quote === null) return
    const account = walletAddress ?? await connectWallet()
    if (account === null) return
    setOperation({ running: true, message: 'Running final onchain simulation…', error: null })
    try {
      const plan = await protocolClient.prepareExecute({
        payer: account,
        quote,
        recipient: account,
        refundRecipient: account,
      })
      await submitPlan(plan, account)
    } catch (caught) {
      setOperation({ running: false, message: null, error: caught instanceof Error ? caught.message : 'Could not prepare the executable route.' })
    }
  }

  const dockPosition = async (position: PositionSummary) => {
    const account = walletAddress ?? await connectWallet()
    if (account === null) return
    setOperation({ running: true, message: 'Preparing dock transaction…', error: null })
    try {
      const dockPlan = await protocolClient.prepareDock({ maker: account, positionId: position.id })
      await submitPlan(dockPlan, account)
    } catch (caught) {
      setOperation({ running: false, message: null, error: caught instanceof Error ? caught.message : 'Could not prepare the dock transaction.' })
    }
  }

  if (error !== null) {
    return (
      <main className="fatal-error">
        <span>Gateway unavailable</span><h1>ArcBook could not load.</h1><p>{error}</p><button onClick={() => window.location.reload()}>Retry</button>
      </main>
    )
  }

  if (view === null) return <LoadingScreen />

  const toggleWallet = () => {
    if (walletAddress !== null) setWalletAddress(null)
    else void connectWallet()
  }

  return (
    <AppShell
      activeView={activeView}
      onNavigate={navigate}
      walletAddress={walletAddress}
      onWalletToggle={toggleWallet}
      bootstrap={view.bootstrap}
    >
      {activeView === 'home' ? <LandingView view={view} onNavigate={navigate} /> : null}
      {activeView === 'trade' ? (
        <TradeView
          view={view}
          quote={quote}
          quoteError={quoteError}
          quoteLoading={quoteLoading}
          amount={amount}
          setAmount={setAmount}
          side={side}
          setSide={setSide}
          kind={kind}
          setKind={setKind}
          slippageBps={slippageBps}
          setSlippageBps={setSlippageBps}
          walletAddress={walletAddress}
          operation={operation}
          onExecute={() => void executeQuote()}
        />
      ) : null}
      {activeView === 'portfolio' ? (
        <PortfolioView
          view={view}
          onNavigate={navigate}
          walletAddress={walletAddress}
          onConnect={() => void connectWallet()}
          operation={operation}
          onDock={(position) => void dockPosition(position)}
        />
      ) : null}
      {activeView === 'studio' ? (
        <MakerStudio
          view={view}
          onNavigate={navigate}
          walletAddress={walletAddress}
          onConnect={connectWallet}
          operation={operation}
          onExecutePlan={executePlan}
        />
      ) : null}
      <div className="global-statusbar">
        <span><i className="status-dot" /> {view.bootstrap.mode} solver {view.bootstrap.meta.stale ? 'degraded' : 'online'}</span>
        <span>ARC / FIELD 01</span><span>{view.bootstrap.protocolVersion}</span>
        <span>{operation.error ?? operation.message ?? (view.bootstrap.features.liveWrites ? 'Writes enabled' : 'Writes safely disabled')}</span>
      </div>
    </AppShell>
  )
}

export default App
