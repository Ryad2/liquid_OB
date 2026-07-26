import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('ArcBook product frontend', () => {
  it('renders the functional order book through the stable client', async () => {
    window.history.replaceState({}, '', '#/trade')
    const { container } = render(<App />)

    expect(
      await screen.findByRole('button', { name: /arcbook home/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('WETH-USDC')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /curve book/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /pay usdc/i })).toBeInTheDocument()
    expect(screen.getByText(/writes safely disabled/i)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /every market position/i })).toBeInTheDocument()
    expect(screen.getByText('P1 · B')).toBeInTheDocument()
    expect(container.querySelectorAll('.curve-path')).toHaveLength(10)
    const positionStartHeights = [...container.querySelectorAll<SVGPathElement>('.curve-path')]
      .map((path) => Number(path.getAttribute('d')?.match(/^M [\d.]+ ([\d.]+)/)?.[1]))
      .filter(Number.isFinite)
      .map((height) => Math.round(height))
    expect(new Set(positionStartHeights).size).toBeGreaterThan(3)

    fireEvent.click(screen.getByRole('button', { name: /net depth/i }))
    expect(await screen.findByRole('img', { name: /aggregated market/i })).toBeInTheDocument()
    expect(container.querySelectorAll('.curve-path')).toHaveLength(2)
    const aggregateStartHeights = [...container.querySelectorAll<SVGPathElement>('.curve-path')]
      .map((path) => Number(path.getAttribute('d')?.match(/^M [\d.]+ ([\d.]+)/)?.[1]))
    expect(aggregateStartHeights[0]).not.toBe(aggregateStartHeights[1])

    fireEvent.click(screen.getByRole('button', { name: /route geometry/i }))
    await waitFor(() => {
      expect(screen.getByRole('img', { name: /selected by the current quote/i })).toBeInTheDocument()
      expect(container.querySelectorAll('.curve-path').length).toBeGreaterThan(0)
      expect(container.querySelectorAll('.curve-path').length).toBeLessThan(5)
    })
  })

  it('opens on the interactive ArcBook landing page', async () => {
    window.history.replaceState({}, '', window.location.pathname)
    render(<App />)

    expect(
      await screen.findByRole('heading', { name: /shape the book/i }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: 'ArcBook' })).toHaveLength(2)
    expect(screen.getByText('ARCBOOK FIELD')).toBeInTheDocument()
    expect(screen.queryByText('WETH–USDC')).not.toBeInTheDocument()
    expect(screen.getByRole('slider', { name: /landing curve alpha/i })).toHaveValue('4.2')

    fireEvent.click(screen.getByRole('button', { name: /start trading/i }))
    expect(await screen.findByRole('heading', { name: /curve book/i })).toBeInTheDocument()
    expect(window.location.hash).toBe('#/trade')
  })

  it('exposes a continuous full-range alpha control in the curve composer', async () => {
    window.history.replaceState({}, '', '#/studio')
    render(<App />)

    const slider = await screen.findByRole('slider', { name: /sell curve alpha/i })
    expect(slider).toHaveAttribute('min', '-30')
    expect(slider).toHaveAttribute('max', '30')
    expect(slider).toHaveAttribute('step', '0.01')

    fireEvent.input(slider, { target: { value: '13.37' } })
    expect(slider).toHaveValue('13.37')
  })

  it('keeps extreme and asymmetric price ranges inside the chart viewport', async () => {
    window.history.replaceState({}, '', '#/studio')
    const { container } = render(<App />)

    fireEvent.change(await screen.findByRole('textbox', { name: /sell curve start price/i }), {
      target: { value: '0.000000000000000001' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: /sell curve end price/i }), {
      target: { value: '340000000000000000000' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: /buy curve start price/i }), {
      target: { value: '300000000000000000000' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: /buy curve end price/i }), {
      target: { value: '0.000000000000000001' },
    })
    fireEvent.input(screen.getByRole('slider', { name: /sell curve alpha/i }), {
      target: { value: '30' },
    })
    fireEvent.input(screen.getByRole('slider', { name: /buy curve alpha/i }), {
      target: { value: '-30' },
    })

    await waitFor(() => {
      const paths = [...container.querySelectorAll<SVGPathElement>('.curve-path')]
      expect(paths).toHaveLength(2)
      for (const path of paths) {
        const data = path.getAttribute('d') ?? ''
        expect(data).not.toMatch(/NaN|Infinity/)
        expect(data).toContain(' C ')
        expect(data).not.toContain(' L ')
        const coordinates = data.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
        expect(coordinates.length).toBeGreaterThan(20)
        expect(coordinates.every((coordinate) => coordinate >= 0 && coordinate <= 920)).toBe(true)
      }
    })
  })

  it('keeps wallet-owned portfolio data hidden until connection', async () => {
    window.history.replaceState({}, '', '#/portfolio')
    const { container } = render(<App />)

    expect(
      await screen.findByRole('heading', { name: /your liquidity, tied to your address/i }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Position map' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /connect wallet/i }))

    expect(await screen.findByRole('heading', { name: 'Position map' })).toBeInTheDocument()
    expect(screen.getByText('3 total')).toBeInTheDocument()
    expect(container.querySelectorAll('.curve-path')).toHaveLength(6)
    expect(screen.getByText('P1 · B')).toBeInTheDocument()
    expect(screen.getByText('P3 · S')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /net depth/i }))
    expect(await screen.findByRole('heading', { name: 'Net depth' })).toBeInTheDocument()
    expect(container.querySelectorAll('.curve-path')).toHaveLength(2)
  })
})
