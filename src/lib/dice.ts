import type { DiceGroup, DiceMode, DiceRequest, DiceRoll } from '../types'

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

export function modeLabel(mode: DiceMode | undefined): string {
  if (mode === 'advantage') return 'con ventaja'
  if (mode === 'disadvantage') return 'con desventaja'
  if (mode === 'drop-lowest') return 'descartando el menor'
  return ''
}

/** Normaliza el modo: ventaja/desventaja solo con un dado; descartar solo con dos o más. */
export function effectiveMode(request: DiceRequest): DiceMode {
  const mode = request.mode ?? 'normal'
  if ((mode === 'advantage' || mode === 'disadvantage') && request.count !== 1) return 'normal'
  if (mode === 'drop-lowest' && request.count < 2) return 'normal'
  return mode
}

export function describeRequest(request: DiceRequest): string {
  const base = notation(request.sides, request.count, request.bonus)
  const label = modeLabel(effectiveMode(request))
  return label ? `${base} ${label}` : base
}

export function rollDice(
  sides: number,
  count: number,
  bonus: number,
  random: () => number = Math.random,
  mode: DiceMode = 'normal',
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
  const finalMode = effectiveMode({ sides, count, bonus, mode })
  const roll = () => Math.floor(random() * sides) + 1
  const amount = finalMode === 'advantage' || finalMode === 'disadvantage' ? 2 : count
  const values = Array.from({ length: amount }, roll)

  let kept = values
  let note = ''
  if (finalMode === 'advantage' || finalMode === 'disadvantage') {
    const chosen = finalMode === 'advantage' ? Math.max(...values) : Math.min(...values)
    kept = [chosen]
    note = ` (se queda ${chosen})`
  } else if (finalMode === 'drop-lowest') {
    const lowest = Math.min(...values)
    const index = values.indexOf(lowest)
    kept = values.filter((_, i) => i !== index)
    note = ` (descarta ${lowest})`
  }

  const total = kept.reduce((sum, value) => sum + value, 0) + bonus
  const natural = sides === 20 && kept.length === 1 ? kept[0] : null
  const description = describeRequest({ sides, count, bonus, mode: finalMode })
  let detail = `[${values.join(', ')}]${note}`
  if (bonus > 0) detail += ` + ${bonus}`
  else if (bonus < 0) detail += ` - ${Math.abs(bonus)}`
  detail += ` = ${total}`
  const naturalNote = natural === 20 ? ' — ¡20 natural!' : natural === 1 ? ' — ¡1 natural!' : ''

  return {
    sides,
    count,
    bonus,
    mode: finalMode,
    values,
    kept,
    total,
    natural,
    notation: notation(sides, count, bonus),
    detail: `${detail}${naturalNote}`,
    message: `🎲 Tirada ${description}: ${detail}${naturalNote}`,
  }
}

export function rollRequest(request: DiceRequest, random: () => number = Math.random): DiceRoll {
  return rollDice(request.sides, request.count, request.bonus, random, request.mode ?? 'normal')
}

export function messageFor(rolls: DiceRoll[]): string {
  if (!rolls.length) return ''
  if (rolls.length === 1) return rolls[0].message
  return [
    '🎲 Tiradas:',
    ...rolls.map((roll, index) => `${index + 1}) ${describeRequest(roll)}: ${roll.detail}`),
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
  mode: DiceMode = 'normal',
): DiceRequest {
  return { sides, count, bonus, mode }
}

export function toGroup(request: DiceRequest): DiceGroup {
  return {
    die: `d${request.sides}`,
    count: String(request.count),
    bonus: String(request.bonus),
    mode: request.mode ?? 'normal',
  }
}

const DICE_MODES: DiceMode[] = ['normal', 'advantage', 'disadvantage', 'drop-lowest']

/** Normaliza filas del lanzador leídas de almacenamiento o de un archivo. */
export function normalizeDiceGroups(value: unknown): DiceGroup[] {
  if (!Array.isArray(value)) return []
  return value
    .slice(0, MAX_GROUPS)
    .filter((item: any) => item && typeof item.die === 'string')
    .map((item: any) => {
      const group: DiceGroup = {
        die: item.die || 'd20',
        count: String(item.count ?? '1'),
        bonus: String(item.bonus ?? '0'),
      }
      if (DICE_MODES.includes(item.mode) && item.mode !== 'normal') group.mode = item.mode
      return group
    })
}

export function joinWithAnd(items: string[]): string {
  if (!items.length) return ''
  if (items.length === 1) return items[0]
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
}

/** Valida una fila del lanzador. Devuelve la petición o un mensaje de error. */
export function validateGroup(group: DiceGroup): DiceRequest | string {
  const sides = parseDie(group.die)
  if (!sides) return 'elige un dado válido'
  const count = Number(group.count)
  if (!Number.isInteger(count) || count < 1 || count > MAX_DICE) {
    return `cantidad entre 1 y ${MAX_DICE}`
  }
  const bonus = group.bonus.trim() === '' ? 0 : Number(group.bonus)
  if (!Number.isInteger(bonus) || Math.abs(bonus) > MAX_BONUS) {
    return `bono entre -${MAX_BONUS} y ${MAX_BONUS}`
  }
  const request: DiceRequest = { sides, count, bonus, mode: group.mode ?? 'normal' }
  return { ...request, mode: effectiveMode(request) }
}

// ---------------------------------------------------------------------------
// Sugerencias a partir de la petición del DM
// ---------------------------------------------------------------------------

export interface DiceSuggestion {
  label: string
  requests: DiceRequest[]
}

const diceToken =
  /(?<![\p{L}\p{N}])(\d{0,3})d(\d{1,3})(?![\p{L}\p{N}])(?:\s*([+\-−–])\s*(\d{1,3})(?![\p{L}\p{N}]))?/giu

/**
 * Extrae las tiradas que pide el DM ("Lanza un d20 + 5", "lanza 1d8 de daño",
 * "6 grupos de 4d6 descartando el más bajo"). Ignora tiradas ya resueltas
 * como "d20 [8] + 4 = 12".
 */
export function suggestDice(text: string, max = 4): DiceSuggestion[] {
  const clean = text.replace(/[*_`]/g, '')
  const suggestions: DiceSuggestion[] = []
  const seen = new Set<string>()

  for (const match of clean.matchAll(diceToken)) {
    const index = match.index ?? 0
    const after = clean.slice(index + match[0].length, index + match[0].length + 4)
    if (/^\s*\[/.test(after) || /^\s*=/.test(after)) continue

    const sides = Number(match[2])
    if (!DICE_TYPES.includes(sides)) continue
    const count = match[1] ? Number(match[1]) : 1
    if (!Number.isInteger(count) || count < 1 || count > MAX_DICE) continue
    const sign = match[3]
    const bonus = sign && match[4] ? Number(match[4]) * (sign === '+' ? 1 : -1) : 0
    if (Math.abs(bonus) > MAX_BONUS) continue

    const sentence = sentenceAround(clean, index, index + match[0].length)
    let mode: DiceMode = 'normal'
    if (count === 1 && sides === 20) {
      if (/desventaja/i.test(sentence)) mode = 'disadvantage'
      else if (/(?<!sin\s)ventaja/i.test(sentence)) mode = 'advantage'
    }
    if (count >= 2 && /descart|m[aá]s bajo|menor/i.test(sentence)) mode = 'drop-lowest'

    let repeat = 1
    const groups = /\b(\d|seis|cinco|cuatro|tres|dos)\s+(?:grupos|veces|tiradas)\b/i.exec(sentence)
    if (groups && mode === 'drop-lowest') {
      repeat = wordToNumber(groups[1]) ?? 1
      repeat = Math.min(Math.max(repeat, 1), MAX_GROUPS)
    }

    const request: DiceRequest = { sides, count, bonus, mode }
    const key = `${repeat}x${describeRequest(request)}`
    if (seen.has(key)) continue
    seen.add(key)
    const label = repeat > 1 ? `${repeat} × ${describeRequest(request)}` : describeRequest(request)
    suggestions.push({ label, requests: Array.from({ length: repeat }, () => ({ ...request })) })
    if (suggestions.length >= max) break
  }
  return suggestions
}

function sentenceAround(text: string, start: number, end: number): string {
  const before = text.slice(0, start)
  const from = Math.max(before.lastIndexOf('.'), before.lastIndexOf('\n'), before.lastIndexOf('!'), before.lastIndexOf('?')) + 1
  const rest = text.slice(end)
  const stop = rest.search(/[.!?\n]/)
  return text.slice(from, stop === -1 ? text.length : end + stop)
}

function wordToNumber(word: string): number | null {
  const words: Record<string, number> = { dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6 }
  const lower = word.toLowerCase()
  if (lower in words) return words[lower]
  const value = Number(lower)
  return Number.isInteger(value) ? value : null
}

// ---------------------------------------------------------------------------
// Lectura de mensajes de tirada (para mostrarlos como tarjetas)
// ---------------------------------------------------------------------------

export interface ParsedRoll {
  label: string
  values: number[]
  dropped: number | null
  kept: number | null
  total: number
  natural: number | null
  sides: number | null
}

const rollLine =
  /^(?:🎲\s*Tirada\s+|\d+\)\s*)(.+?):\s*\[([\d,\s]+)\](?:\s*\((descarta|se queda)\s+(\d+)\))?[^=]*=\s*(-?\d+)(.*)$/u

/** Devuelve las tiradas de un mensaje generado por el lanzador, o null. */
export function parseRollMessage(content: string): ParsedRoll[] | null {
  const text = content.trim()
  if (!text.startsWith('🎲')) return null
  const rolls: ParsedRoll[] = []
  for (const line of text.split(/\r?\n/)) {
    const match = rollLine.exec(line.trim())
    if (!match) continue
    const label = match[1].trim()
    const sides = /d(\d+)/i.exec(label)
    const rest = match[6] ?? ''
    rolls.push({
      label,
      values: match[2]
        .split(',')
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value)),
      dropped: match[3] === 'descarta' ? Number(match[4]) : null,
      kept: match[3] === 'se queda' ? Number(match[4]) : null,
      total: Number(match[5]),
      natural: /¡20 natural!/.test(rest) ? 20 : /¡1 natural!/.test(rest) ? 1 : null,
      sides: sides ? Number(sides[1]) : null,
    })
  }
  return rolls.length ? rolls : null
}

/** Convierte una tirada recién lanzada al formato de tarjeta. */
export function toParsedRoll(roll: DiceRoll): ParsedRoll {
  const mode = roll.mode ?? 'normal'
  return {
    label: describeRequest(roll),
    values: roll.values,
    dropped: mode === 'drop-lowest' ? Math.min(...roll.values) : null,
    kept: mode === 'advantage' || mode === 'disadvantage' ? roll.kept[0] : null,
    total: roll.total,
    natural: roll.natural === 20 || roll.natural === 1 ? roll.natural : null,
    sides: roll.sides,
  }
}
