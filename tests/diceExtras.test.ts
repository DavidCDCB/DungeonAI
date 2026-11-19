import { describe, expect, it } from 'vitest'
import {
  describeRequest,
  messageFor,
  normalizeDiceGroups,
  parseRollMessage,
  rollDice,
  suggestDice,
  validateGroup,
} from '../src/lib/dice'

/** Generador que devuelve, en orden, los valores de dado indicados. */
function sequence(sides: number, values: number[]) {
  let index = 0
  return () => (values[index++ % values.length] - 1) / sides
}

describe('Modos de tirada', () => {
  it('ventaja se queda con el mayor y marca el 20 natural', () => {
    const roll = rollDice(20, 1, 5, sequence(20, [20, 8]), 'advantage')
    expect(roll.values).toEqual([20, 8])
    expect(roll.kept).toEqual([20])
    expect(roll.total).toBe(25)
    expect(roll.natural).toBe(20)
    expect(roll.message).toBe('🎲 Tirada 1d20 + 5 con ventaja: [20, 8] (se queda 20) + 5 = 25 — ¡20 natural!')
  })

  it('desventaja se queda con el menor', () => {
    const roll = rollDice(20, 1, 0, sequence(20, [14, 3]), 'disadvantage')
    expect(roll.total).toBe(3)
    expect(roll.natural).toBe(3)
  })

  it('descartar el menor para atributos', () => {
    const roll = rollDice(6, 4, 0, sequence(6, [5, 3, 6, 2]), 'drop-lowest')
    expect(roll.kept).toEqual([5, 3, 6])
    expect(roll.total).toBe(14)
    expect(roll.detail).toBe('[5, 3, 6, 2] (descarta 2) = 14')
  })

  it('ignora modos que no aplican', () => {
    expect(rollDice(20, 2, 0, () => 0.5, 'advantage').mode).toBe('normal')
    expect(rollDice(6, 1, 0, () => 0.5, 'drop-lowest').mode).toBe('normal')
  })

  it('mantiene el formato clásico en tiradas normales', () => {
    const roll = rollDice(8, 2, -1, sequence(8, [3, 4]))
    expect(roll.message).toBe('🎲 Tirada 2d8 - 1: [3, 4] - 1 = 6')
  })
})

describe('Sugerencias del DM', () => {
  it('lee el dado, el bono y la ventaja', () => {
    const suggestions = suggestDice(
      '🎲 *Lanza un **d20 + 5** (tu modificador de Arcanos) con ventaja para esta prueba.*',
    )
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].requests[0]).toEqual({ sides: 20, count: 1, bonus: 5, mode: 'advantage' })
    expect(suggestions[0].label).toBe('1d20 + 5 con ventaja')
  })

  it('separa ataque y daño', () => {
    const suggestions = suggestDice(
      'Lanza un d20 + 4 para atacar al goblin (CA 15). Si impactas, lanza 1d8 de daño por frío.',
    )
    expect(suggestions.map((item) => item.label)).toEqual(['1d20 + 4', '1d8'])
  })

  it('reconoce la tirada de atributos', () => {
    const [suggestion] = suggestDice(
      'Lanza 6 grupos de 4d6, descartando el dado más bajo de cada grupo.',
    )
    expect(suggestion.label).toBe('6 × 4d6 descartando el menor')
    expect(suggestion.requests).toHaveLength(6)
  })

  it('ignora tiradas ya resueltas por el DM', () => {
    expect(suggestDice('(Goblin: d20 [8] + 4 = 12 vs. tu CA 13 — ¡falla!)')).toEqual([])
  })
})

describe('Lectura de tiradas enviadas', () => {
  it('lee una tirada simple', () => {
    const [roll] = parseRollMessage('🎲 Tirada 1d20 + 5: [14] + 5 = 19')!
    expect(roll).toMatchObject({ label: '1d20 + 5', values: [14], total: 19, sides: 20, natural: null })
  })

  it('lee tiradas múltiples con descartes y naturales', () => {
    const message = messageFor([
      rollDice(20, 1, 2, sequence(20, [1, 9]), 'disadvantage'),
      rollDice(6, 4, 0, sequence(6, [5, 3, 6, 2]), 'drop-lowest'),
    ])
    const rolls = parseRollMessage(message)!
    expect(rolls).toHaveLength(2)
    expect(rolls[0]).toMatchObject({ kept: 1, total: 3, natural: 1 })
    expect(rolls[1]).toMatchObject({ dropped: 2, total: 14, values: [5, 3, 6, 2] })
  })

  it('ignora mensajes normales', () => {
    expect(parseRollMessage('Abro la puerta')).toBeNull()
  })
})

describe('Validación y normalización', () => {
  it('valida filas del lanzador', () => {
    expect(validateGroup({ die: 'd20', count: '1', bonus: '3', mode: 'advantage' })).toEqual({
      sides: 20,
      count: 1,
      bonus: 3,
      mode: 'advantage',
    })
    expect(validateGroup({ die: 'd7', count: '1', bonus: '0' })).toBe('elige un dado válido')
    expect(validateGroup({ die: 'd6', count: '0', bonus: '0' })).toMatch(/cantidad/)
  })

  it('describe las peticiones', () => {
    expect(describeRequest({ sides: 6, count: 4, bonus: 0, mode: 'drop-lowest' })).toBe(
      '4d6 descartando el menor',
    )
  })

  it('normaliza modos desconocidos', () => {
    expect(
      normalizeDiceGroups([{ die: 'd20', count: 1, bonus: 2, mode: 'trampa' }, { nope: true }]),
    ).toEqual([{ die: 'd20', count: '1', bonus: '2' }])
  })
})
