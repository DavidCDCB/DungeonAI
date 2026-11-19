import { describe, expect, it } from 'vitest'
import { messageFor, notation, rollDice } from '../src/lib/dice'

describe('Dice', () => {
  it('respeta tipo, cantidad y bono', () => {
    const roll = rollDice(6, 3, 2, () => 0.5)
    expect(roll.values).toEqual([4, 4, 4])
    expect(roll.total).toBe(14)
    expect(roll.notation).toBe('3d6 + 2')
  })

  it('formatea la notación negativa', () => {
    expect(notation(8, 1, -3)).toBe('1d8 - 3')
  })

  it('combina varias tiradas en un mensaje', () => {
    const rolls = [
      rollDice(20, 1, 5, () => 0),
      rollDice(6, 2, 0, () => 0.5),
    ]
    const message = messageFor(rolls)
    expect(message).toContain('🎲 Tiradas:')
    expect(message).toContain('1) 1d20 + 5:')
    expect(message).toContain('2) 2d6:')
  })
})
