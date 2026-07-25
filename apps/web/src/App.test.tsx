import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('ArcBook product frontend', () => {
  it('renders the functional order book through the stable client', async () => {
    window.history.replaceState({}, '', '#/trade')
    render(<App />)

    expect(
      await screen.findByRole('button', { name: /arcbook home/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('WETH-USDC')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /curve book/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /pay usdc/i })).toBeInTheDocument()
    expect(screen.getByText(/writes safely disabled/i)).toBeInTheDocument()
  })

  it('opens on the interactive ArcBook landing page', async () => {
    window.history.replaceState({}, '', window.location.pathname)
    render(<App />)

    expect(
      await screen.findByRole('heading', { name: /shape the book/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: /landing curve alpha/i })).toHaveValue('4.2')

    fireEvent.click(screen.getByRole('button', { name: /open terminal/i }))
    expect(await screen.findByRole('heading', { name: /curve book/i })).toBeInTheDocument()
    expect(window.location.hash).toBe('#/trade')
  })

  it('keeps quick alpha controls while allowing larger numeric values', async () => {
    window.history.replaceState({}, '', '#/studio')
    render(<App />)

    const slider = await screen.findByRole('slider', { name: /sell curve alpha/i })
    expect(slider).toHaveAttribute('min', '-20')
    expect(slider).toHaveAttribute('max', '20')
    expect(slider).toHaveAttribute('step', '0.01')

    const numericInput = screen.getByRole('spinbutton', { name: /sell alpha value/i })
    expect(numericInput).not.toHaveAttribute('max')
    fireEvent.change(numericInput, { target: { value: '100' } })
    expect(numericInput).toHaveValue(100)
  })

  it('keeps wallet-owned portfolio data hidden until connection', async () => {
    window.history.replaceState({}, '', '#/portfolio')
    render(<App />)

    expect(
      await screen.findByRole('heading', { name: /your liquidity, tied to your address/i }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Liquidity atlas')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /connect wallet/i }))

    expect(await screen.findByText('Liquidity atlas')).toBeInTheDocument()
    expect(screen.getByText('1 total')).toBeInTheDocument()
    expect(screen.queryByText('3 total')).not.toBeInTheDocument()
  })
})
