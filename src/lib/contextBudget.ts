import type { ChatMessage } from '../types'
import { modelHistoryContent } from './messages'

export const DEFAULT_CONTEXT_LIMIT = 1_000_000
export const OUTPUT_RESERVE = 64_000
const SAFETY = 0.95
const SYSTEM_OVERHEAD = 16
const MESSAGE_OVERHEAD = 8
const MIN_BUDGET = 512
const CHARS_PER_TOKEN = 3.5

export interface HistorySelection {
  messages: ChatMessage[]
  estimatedTokens: number
  truncatedLast: boolean
}

export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN))
}

/** Tokens aproximados para una cantidad de caracteres. */
export function charsToTokens(chars: number): number {
  return chars > 0 ? Math.max(1, Math.ceil(chars / CHARS_PER_TOKEN)) : 0
}

export function charsForTokens(tokens: number): number {
  return tokens > 0 ? Math.floor(tokens * CHARS_PER_TOKEN) : 0
}

/**
 * Devuelve todo el historial que cabe en la ventana. Si no cabe, conserva el
 * sufijo más reciente. Siempre reserva espacio para la respuesta del modelo.
 */
export function selectHistory(
  systemPrompt: string,
  messages: ChatMessage[],
  contextLimit = DEFAULT_CONTEXT_LIMIT,
  outputReserve = OUTPUT_RESERVE,
): HistorySelection {
  const limit = contextLimit > 0 ? contextLimit : DEFAULT_CONTEXT_LIMIT
  const reserve = Math.min(Math.max(outputReserve, 0), Math.floor(limit / 2))
  const budget = Math.floor(Math.max(limit - reserve, MIN_BUDGET) * SAFETY)
  let used = estimateTokens(systemPrompt) + SYSTEM_OVERHEAD
  const selected: ChatMessage[] = []

  for (const message of [...messages].reverse()) {
    const content = modelHistoryContent(message)
    if (!content.trim()) continue
    const cost = estimateTokens(content) + MESSAGE_OVERHEAD
    if (used + cost > budget) break
    selected.unshift(message)
    used += cost
  }

  if (!selected.length && messages.length) {
    const last = messages[messages.length - 1]
    const content = modelHistoryContent(last)
    const free = Math.max(budget - used, 0)
    const chars = charsForTokens(Math.max(free - MESSAGE_OVERHEAD, 0))
    if (content.trim() && chars > 0) {
      const truncated = content.slice(0, chars)
      const copy: ChatMessage = {
        ...last,
        content: truncated,
        display: truncated,
        state: last.role === 'assistant' ? '' : last.state,
        options: last.role === 'assistant' ? [] : last.options,
        diceRequest: false,
      }
      selected.push(copy)
      used += estimateTokens(truncated) + MESSAGE_OVERHEAD
      return { messages: selected, estimatedTokens: used, truncatedLast: true }
    }
  }

  return { messages: selected, estimatedTokens: used, truncatedLast: false }
}
