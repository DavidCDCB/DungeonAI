import { describe, expect, it } from 'vitest'
import { formatElapsed, formatNumber, formatRate } from '../src/lib/format'
import { charsToTokens } from '../src/lib/contextBudget'

describe('Formato de métricas', () => {
  it('muestra números completos y velocidad con un decimal', () => {
    expect(formatNumber(12345)).toMatch(/^12[.\u00a0 ]?345$/)
    expect(formatRate(45.24)).toBe('45,2 tok/s')
    expect(formatRate(7)).toBe('7,0 tok/s')
    expect(formatElapsed(65_000)).toBe('1:05')
  })

  it('estima tokens a partir de caracteres', () => {
    expect(charsToTokens(0)).toBe(0)
    expect(charsToTokens(1)).toBe(1)
    expect(charsToTokens(350)).toBe(100)
  })
})
