import type { DiceRequest, DiceRoll } from '../types'

export const MAX_DICE = 100
export const MAX_BONUS = 999
export const MAX_GROUPS = 10
export const DICE_TYPES = [4, 6, 8, 10, 12, 20, 100]

export function notation(sides: number, count: number, bonus: number): string {
  let text = `${count}d${sides}`
  if (bonus > 0) text += ` + ${bonus}`
  else if (bonus < 0) text += ` - ${Math.abs(bonus)}`
  return text
}

export function rollDice(
  sides: number,
  count: number,
  bonus: number,
  random: () => number = Math.random,
): DiceRoll {
  if (!Number.isInteger(sides) || sides < 2 || sides > 1000) {
    throw new Error('tipo de dado inválido')
  }
  if (!Number.isInteger(count) || count < 1 || count > MAX_DICE) {
    throw new Error('cantidad inválida')
  }
  if (!Number.isInteger(bonus) || bonus < -MAX_BONUS || bonus > MAX_BONUS) {
    throw new Error('bonificación inválida')
  }
  const values = Array.from(
    { length: count },
    () => Math.floor(random() * sides) + 1,
  )
  const total = values.reduce((sum, value) => sum + value, 0) + bonus
  const notacion = notation(sides, count, bonus)
  let detail = `[${values.join(', ')}]`
  if (bonus > 0) detail += ` + ${bonus}`
  else if (bonus < 0) detail += ` - ${Math.abs(bonus)}`
  detail += ` = ${total}`
  return {
    sides,
    count,
    bonus,
    values,
    total,
    notation: notacion,
    detail,
    message: `🎲 Tirada ${notacion}: ${detail}`,
  }
}

export function messageFor(rolls: DiceRoll[]): string {
  if (!rolls.length) return ''
  if (rolls.length === 1) return rolls[0].message
  return [
    '🎲 Tiradas:',
    ...rolls.map(
      (roll, index) => `${index + 1}) ${roll.notation}: ${roll.detail}`,
    ),
  ].join('\n')
}

export function parseDie(value: string): number | null {
  const match = /^d(\d+)$/i.exec(value.trim())
  if (!match) return null
  const sides = Number(match[1])
  return DICE_TYPES.includes(sides) ? sides : null
}

export function toRequest(
  sides: number,
  count: number,
  bonus: number,
): DiceRequest {
  return { sides, count, bonus }
}

export function joinWithAnd(items: string[]): string {
  if (!items.length) return ''
  if (items.length === 1) return items[0]
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
}
