import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('frontend gateway integration harness', () => {
  it('renders deterministic market, route, and position data through the client', async () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { level: 1, name: /liquid ob/i }),
    ).toBeInTheDocument()
    expect(await screen.findByText('WETH / USDC')).toBeInTheDocument()
    expect(screen.getByText(/1,000 USDC mock route/i)).toBeInTheDocument()
    expect(screen.getByText(/3 mock positions/i)).toBeInTheDocument()
    expect(screen.getByText(/sendable: false/i)).toBeInTheDocument()
  })
})
