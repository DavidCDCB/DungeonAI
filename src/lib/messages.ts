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

let nextId = 1

export function createMessage(
  role: Role,
  content: string,
  id = `m${Date.now()}-${nextId++}`,
): ChatMessage {
  const parsed =
    role === 'assistant'
      ? parseOptions(content)
      : { display: content, options: [] as string[] }
  const memoria =
    role === 'assistant' ? extractState(parsed.display) : { display: parsed.display, state: '' }
  const diceRequest =
    role === 'assistant' &&
    (marcadorTirada.test(memoria.display) || peticionTirada.test(memoria.display))
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
  )
}

/** Mensaje visible con las opciones que el modelo ofreció. */
export function withVisibleOptions(message: ChatMessage): string {
  if (message.role !== 'assistant' || message.diceRequest || !message.options.length) {
    return message.display
  }
  return message.display
}
