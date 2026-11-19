import type { ChatMessage, Reasoning, Settings, TokenUsage } from '../types'
import { estimateTokens, selectHistory } from './contextBudget'
import { modelHistoryContent } from './messages'
import { isOpenCodeBase, normalizeBaseUrl, requiresApiKey } from './providers'

export class ApiError extends Error {
  constructor(
    message: string,
    public code = 0,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface ChatResult {
  content: string
  usage: TokenUsage
}

const MAX_TOKENS_MAX = 64_000
const SESSION_ID =
  (globalThis.crypto && 'randomUUID' in globalThis.crypto
    ? globalThis.crypto.randomUUID()
    : `web-${Date.now()}-${Math.random().toString(16).slice(2)}`)

function timeoutFor(effort: Reasoning | null): number {
  if (effort === 'max') return 420_000
  if (effort === 'xhigh') return 180_000
  return 120_000
}

function maxTokensFor(effort: Reasoning | null): number | null {
  return effort === 'max' ? MAX_TOKENS_MAX : null
}

export function nextEffort(effort: Reasoning | null): Reasoning | null {
  if (effort === 'max') return 'xhigh'
  if (effort === 'xhigh') return 'high'
  return null
}

function buildEndpoint(settings: Settings): string {
  const base = normalizeBaseUrl(settings.baseUrl) || '/api/opencode'
  return `${base}/chat/completions`
}

function buildHeaders(settings: Settings): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  if (settings.apiKey.trim()) {
    headers.Authorization = `Bearer ${settings.apiKey.trim()}`
  }
  if (isOpenCodeBase(settings.baseUrl)) {
    headers['x-opencode-session'] = SESSION_ID
  }
  return headers
}

async function chatOnce(
  settings: Settings,
  systemPrompt: string,
  messages: ChatMessage[],
  effort: Reasoning | null,
): Promise<ChatResult> {
  if (requiresApiKey(settings.baseUrl) && !settings.apiKey.trim()) {
    throw new ApiError('Falta la API key del proveedor.')
  }

  const selection = selectHistory(systemPrompt, messages)
  const payloadMessages = [
    { role: 'system', content: systemPrompt },
    ...selection.messages.map((message) => ({
      role: message.role,
      content: modelHistoryContent(message),
    })),
  ]
  const body: Record<string, unknown> = {
    model: settings.model,
    messages: payloadMessages,
    temperature: 0.85,
  }
  if (effort) body.reasoning_effort = effort
  const maxTokens = maxTokensFor(effort)
  if (maxTokens) body.max_tokens = maxTokens

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutFor(effort))
  try {
    const response = await fetch(buildEndpoint(settings), {
      method: 'POST',
      headers: buildHeaders(settings),
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const raw = await response.text()
    let data: any = null
    try {
      data = JSON.parse(raw)
    } catch {
      data = null
    }
    if (!response.ok) {
      const detail = data?.error?.message ?? raw.slice(0, 300)
      throw new ApiError(
        `HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
        response.status,
      )
    }
    if (!data) throw new ApiError('El servidor devolvió una respuesta inválida.')
    const content = String(data?.choices?.[0]?.message?.content ?? '')
    if (!content.trim()) throw new ApiError('El modelo no devolvió texto.')
    return {
      content,
      usage: readUsage(data.usage, selection.messages, systemPrompt, content),
    }
  } catch (error) {
    if (error instanceof ApiError) throw error
    if ((error as Error)?.name === 'AbortError') {
      throw new ApiError('El modelo tardó demasiado. Prueba con xhigh o high.')
    }
    throw new ApiError(
      `No se pudo contactar al modelo: ${(error as Error)?.message ?? 'error de red'}`,
    )
  } finally {
    clearTimeout(timer)
  }
}

function readUsage(
  usage: any,
  selected: ChatMessage[],
  systemPrompt: string,
  content: string,
): TokenUsage {
  if (usage && typeof usage === 'object') {
    const prompt = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0)
    const completion = Number(usage.completion_tokens ?? usage.output_tokens ?? 0)
    if (prompt > 0 || completion > 0) {
      return {
        prompt,
        completion,
        total: Number(usage.total_tokens ?? 0) || prompt + completion,
        cached: Number(usage.prompt_tokens_details?.cached_tokens ?? 0),
        reasoning:
          Number(usage.opencode?.tokens?.reasoning ?? 0) ||
          Number(usage.completion_tokens_details?.reasoning_tokens ?? 0),
        estimated: false,
        sentMessages: selected.length,
      }
    }
  }
  const promptChars =
    systemPrompt.length +
    selected.reduce((total, message) => total + modelHistoryContent(message).length, 0)
  const prompt = Math.max(1, Math.ceil(promptChars / 3.5))
  const completion = estimateTokens(content)
  return {
    prompt,
    completion,
    total: prompt + completion,
    cached: 0,
    reasoning: 0,
    estimated: true,
    sentMessages: selected.length,
  }
}

export async function chatWithFallback(
  settings: Settings,
  systemPrompt: string,
  messages: ChatMessage[],
): Promise<ChatResult> {
  const effort = settings.reasoning
  try {
    return await chatOnce(settings, systemPrompt, messages, effort)
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.code === 400 &&
      /reasoning/i.test(error.message)
    ) {
      return chatOnce(settings, systemPrompt, messages, null)
    }
    if (
      error instanceof ApiError &&
      error.code === 0 &&
      /no devolvió texto/i.test(error.message)
    ) {
      const next = nextEffort(effort)
      if (next) {
        try {
          return await chatOnce(settings, systemPrompt, messages, next)
        } catch (retryError) {
          if (
            retryError instanceof ApiError &&
            retryError.code === 0 &&
            /no devolvió texto/i.test(retryError.message)
          ) {
            return chatOnce(settings, systemPrompt, messages, null)
          }
          throw retryError
        }
      }
      return chatOnce(settings, systemPrompt, messages, null)
    }
    throw error
  }
}

/** Pide solo las 5 opciones que faltan, con razonamiento bajo. */
export async function requestMissingOptions(
  settings: Settings,
  systemPrompt: string,
  history: ChatMessage[],
): Promise<string | null> {
  const result = await chatOnce(
    { ...settings, reasoning: 'low' },
    systemPrompt,
    history,
    'low',
  )
  return result.content
}
