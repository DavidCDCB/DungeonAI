import type { ChatMessage, Role } from '../types'
import { parseOptions, plain } from './options'
import { extractState } from './gameState'

const marcadorTirada = /\[\s*TIRADA\s*]/i
const peticionTirada = new RegExp(
  '(?:\\b(?:lanza|lances|tira|tires|realiza|realices|haz|hagas|necesito|necesitas|debes)\\b[^\\n]{0,100}\\b\\d*d\\d+\\b)' +
    '|(?:\\btirada requerida\\b[^\\n]{0,100}\\b\\d*d\\d+\\b)' +
    '|(?:\\b\\d*d\\d+\\b[^\\n]{0,100}\\b(?:lanza|lances|tira|tires)\\b)',
  'i',
)

/** Tiradas que el DM ya resolvió ("d20 [12] + 6 = 18"): no son peticiones. */
const tiradaResuelta =
  /\b\d*d\d+\b(?:\s*\[[^\]\n]*\])?(?:\s*[+\-−–]\s*\d+)?\s*=\s*-?\d+|\b\d*d\d+\b\s*\[[^\]\n]*\]/gi

function pideTirada(texto: string): boolean {
  return marcadorTirada.test(texto) || peticionTirada.test(texto.replace(tiradaResuelta, ''))
}

let nextId = 1

export function newMessageId(): string {
  return `m${Date.now()}-${nextId++}`
}

export function createMessage(
  role: Role,
  content: string,
  id = newMessageId(),
): ChatMessage {
  const parsed =
    role === 'assistant'
      ? parseOptions(content)
      : { display: content, options: [] as string[] }
  const memoria =
    role === 'assistant' ? extractState(parsed.display) : { display: parsed.display, state: '' }
  const diceRequest = role === 'assistant' && pideTirada(memoria.display)
  const display = diceRequest
    ? memoria.display.replace(marcadorTirada, '').replace(/\n{3,}/g, '\n\n').trim()
    : memoria.display
  return {
    id,
    role,
    content,
    display,
    options: diceRequest ? [] : parsed.options,
    state: memoria.state,
    diceRequest,
  }
}

export function modelHistoryContent(message: ChatMessage): string {
  return message.role === 'assistant' ? message.display : message.content
}

export function optionLines(options: string[]): string {
  return options
    .slice(0, 5)
    .map((option, index) => `{${index + 1}. ${plain(option)}}`)
    .join('\n')
}

export function prepareRepairContent(original: ChatMessage, repair: ChatMessage): ChatMessage | null {
  if (repair.diceRequest) return null
  const options = repair.options
  if (!options.length) return null
  return createMessage(
    'assistant',
    `${original.content.trimEnd()}\n\n${optionLines(options)}`,
    original.id,
  )
}

const trailingHeading = /\n[ \t]*\*{0,2}(?:acciones|opciones|sugerencias)[^\n]*\*{0,2}[ \t]*$/i

/**
 * Texto visible mientras el DM escribe: oculta el bloque [ESTADO], las opciones
 * (aparecen como botones al terminar) y etiquetas a medio escribir.
 */
export function streamingPreview(text: string): string {
  let cut = text.length
  const estado = /\[\s*\/?\s*ESTADO/i.exec(text)
  if (estado) cut = Math.min(cut, estado.index)
  const option = /^[ \t]*\{\s*\d/m.exec(text)
  if (option) cut = Math.min(cut, option.index)
  let visible = text.slice(0, cut)
  visible = visible.replace(/\[[A-Za-zÁÉÍÓÚáéíóú]{0,7}\s*$/, '')
  visible = visible.replace(/\{\s*\d*\s*$/, '')
  return visible.trimEnd().replace(trailingHeading, '').trimEnd()
}

/** La opción "absurda, brillante o hilarantemente peligrosa" lleva 🃏. */
export function isJokerOption(option: string): boolean {
  return option.includes('🃏')
}

export function optionLabel(option: string): string {
  return option.replace(/🃏️?/gu, '').replace(/\s+/g, ' ').trim()
}
