import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('bootstrap application', () => {
  it('states clearly that protocol implementation has not started', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { level: 1, name: /liquid ob/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/No protocol code yet\./)).toBeInTheDocument()
  })
})
