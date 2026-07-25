import { useEffect, useState } from 'react'
import type {
  FrontendBootstrap,
  MarketDetail,
  PositionSummary,
  RouteQuote,
} from '@liquid-ob/frontend-api'
import { parseUnits } from '@liquid-ob/frontend-api'
import { protocolClient } from './protocol/client'
import './App.css'

interface GatewayView {
  bootstrap: FrontendBootstrap
  market: MarketDetail
  positions: PositionSummary[]
  quote: RouteQuote
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function branchLabel(branch: PositionSummary['sell']['policy']['branch']) {
  return branch.replaceAll('-', ' ')
}

function App() {
  const [view, setView] = useState<GatewayView | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const bootstrap = await protocolClient.getBootstrap({
          signal: controller.signal,
        })
        const markets = await protocolClient.listMarkets({}, {
          signal: controller.signal,
        })
        const firstMarket = markets.items[0]
        if (firstMarket === undefined) throw new Error('No mock market is available.')
        const [market, positions, quote] = await Promise.all([
          protocolClient.getMarket(firstMarket.id, { signal: controller.signal }),
          protocolClient.listPositions({ marketId: firstMarket.id }, {
            signal: controller.signal,
          }),
          protocolClient.quote({
            marketId: firstMarket.id,
            side: 'sell',
            kind: 'exact-input',
            amount: {
              token: firstMarket.quoteToken.address,
              raw: parseUnits('1000', firstMarket.quoteToken.decimals),
            },
            slippageBps: 50,
          }, { signal: controller.signal }),
        ])
        setView({ bootstrap, market, positions: positions.items, quote })
      } catch (caught) {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : 'Frontend gateway failed.')
        }
      }
    }
    void load()
    return () => controller.abort()
  }, [])

  return (
    <main>
      <header className="hero">
        <div className="hero-meta">
          <p className="eyebrow">Frontend contract / integration harness</p>
          <span className="mode-pill">{view?.bootstrap.mode ?? 'loading'}</span>
        </div>
        <h1>
          Liquid <span>OB</span>
        </h1>
        <p className="lede">
          Build every screen now. Replace one adapter when contracts, solver,
          and indexed state go live.
        </p>
      </header>

      {error !== null && (
        <section className="gateway-error" role="alert">
          <strong>Gateway unavailable</strong>
          <span>{error}</span>
        </section>
      )}

      {view === null && error === null ? (
        <section className="loading-panel" aria-label="Loading protocol mock">
          <span />
          Loading deterministic protocol state
        </section>
      ) : null}

      {view !== null ? (
        <>
          <section className="status-grid" aria-label="Implementation status">
            <article>
              <span className="index">01 / Foundation</span>
              <h2>Protocol language</h2>
              <p>Wire format, interfaces, oracle, and Aqua/SwapVM proof are green.</p>
            </article>
            <article>
              <span className="index">02 / Frontend</span>
              <h2>Gateway ready</h2>
              <p>{view.positions.length} mock positions share the final product shapes.</p>
            </article>
            <article>
              <span className="index">03 / Live path</span>
              <h2>Intentionally gated</h2>
              <p>Wallet writes remain disabled until ABIs and deployments freeze.</p>
            </article>
          </section>

          <section className="market-console" aria-label="Mock market integration">
            <header>
              <div>
                <p className="section-label">Indexed market</p>
                <h2>{view.market.baseToken.symbol} / {view.market.quoteToken.symbol}</h2>
              </div>
              <div className="freshness">
                <span>head {view.market.meta.chainHeadBlock}</span>
                <span>index -{view.market.meta.indexLag}</span>
              </div>
            </header>

            <div className="market-tape">
              <div>
                <span>best bid</span>
                <strong>{view.market.bestBid?.formatted}</strong>
              </div>
              <div>
                <span>best ask</span>
                <strong>{view.market.bestAsk?.formatted}</strong>
              </div>
              <div>
                <span>spread</span>
                <strong>{view.market.spreadBps} bps</strong>
              </div>
              <div className="quote-result">
                <span>1,000 {view.quote.amountIn.token.symbol} mock route</span>
                <strong>{view.quote.amountOut.formatted} {view.quote.amountOut.token.symbol}</strong>
                <small>{view.quote.fills.length} maker fills / simulated</small>
              </div>
            </div>

            <div className="position-list">
              <div className="position-row position-heading" aria-hidden="true">
                <span>maker</span>
                <span>sell curve</span>
                <span>buy curve</span>
                <span>version</span>
              </div>
              {view.positions.map((position) => (
                <article className="position-row" key={position.id}>
                  <span className="maker">{shortAddress(position.maker)}</span>
                  <span>
                    <b>{position.sell.runtime.currentMarginalPrice.formatted}</b>
                    <small>{branchLabel(position.sell.policy.branch)}</small>
                  </span>
                  <span>
                    <b>{position.buy.runtime.currentMarginalPrice.formatted}</b>
                    <small>{branchLabel(position.buy.policy.branch)}</small>
                  </span>
                  <span className="version">v{position.runtimeVersion}</span>
                </article>
              ))}
            </div>
          </section>

          <aside className="mock-warning">
            <strong>Safe boundary:</strong> this page proves frontend integration,
            not onchain execution. Mock transaction plans are marked
            <code> sendable: false</code>.
          </aside>
        </>
      ) : null}

      <footer>
        <span>@liquid-ob/frontend-api</span>
        <span>single adapter boundary</span>
      </footer>
    </main>
  )
}

export default App
