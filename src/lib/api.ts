import type { ChatMessage, Reasoning, Settings, TokenUsage } from '../types'
import { estimateTokens, selectHistory } from './contextBudget'
import { LORE_SYSTEM_PROMPT, cleanGeneratedLore, loreRequest } from './lore'
import { createMessage, modelHistoryContent } from './messages'
import { isOpenCodeBase, normalizeBaseUrl, requiresApiKey } from './providers'
import { SseParser, contextLimitFromError, isContextError, readStreamChunk } from './sse'

export class ApiError extends Error {
  constructor(
    message: string,
    public code = 0,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** El jugador canceló el turno. */
export class CancelledError extends Error {
  constructor() {
    super('Turno cancelado.')
    this.name = 'CancelledError'
  }
}

export interface ChatResult {
  content: string
  usage: TokenUsage
  /** Si el modelo informó una ventana menor, la nueva ventana aplicada. */
  contextWindow?: number
  streamed: boolean
}

export interface StreamProgress {
  content: string
  reasoningChars: number
}

export interface ChatOptions {
  stream?: boolean
  signal?: AbortSignal
  onProgress?: (progress: StreamProgress) => void
}

interface AttemptOptions extends ChatOptions {
  streamOptions?: boolean
  maxTokens?: number | null
}

const MAX_TOKENS_MAX = 64_000
const SESSION_ID =
  (globalThis.crypto && 'randomUUID' in globalThis.crypto
    ? globalThis.crypto.randomUUID()
    : `web-${Date.now()}-${Math.random().toString(16).slice(2)}`)

/** Tiempo máximo sin recibir datos del servidor. */
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

function buildHeaders(settings: Settings, stream: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: stream ? 'text/event-stream, application/json' : 'application/json',
  }
  if (settings.apiKey.trim()) {
    headers.Authorization = `Bearer ${settings.apiKey.trim()}`
  }
  if (isOpenCodeBase(settings.baseUrl)) {
    headers['x-opencode-session'] = SESSION_ID
  }
  return headers
}

function errorDetail(data: any, raw: string): string {
  const error = data?.error
  if (typeof error === 'string') return error
  if (error?.message) return String(error.message)
  if (typeof data?.message === 'string') return data.message
  if (typeof data?.detail === 'string') return data.detail
  return raw.replace(/\s+/g, ' ').trim().slice(0, 300)
}

/**
 * Temporizador de inactividad: se reinicia cada vez que llegan datos, así los
 * modelos que razonan mucho no se cortan mientras sigan enviando.
 */
function idleTimer(ms: number, onTimeout: () => void) {
  let timer = setTimeout(onTimeout, ms)
  return {
    reset() {
      clearTimeout(timer)
      timer = setTimeout(onTimeout, ms)
    },
    clear() {
      clearTimeout(timer)
    },
  }
}

async function chatOnce(
  settings: Settings,
  systemPrompt: string,
  messages: ChatMessage[],
  effort: Reasoning | null,
  options: AttemptOptions = {},
): Promise<Omit<ChatResult, 'contextWindow'>> {
  if (requiresApiKey(settings.baseUrl) && !settings.apiKey.trim()) {
    throw new ApiError('Falta la API key del proveedor.')
  }
  if (options.signal?.aborted) throw new CancelledError()

  const stream = Boolean(options.stream)
  const selection = selectHistory(systemPrompt, messages, settings.contextWindow)
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
  const maxTokens = options.maxTokens === undefined ? maxTokensFor(effort) : options.maxTokens
  if (maxTokens) body.max_tokens = maxTokens
  if (stream) {
    body.stream = true
    if (options.streamOptions !== false) body.stream_options = { include_usage: true }
  }

  options.onProgress?.({ content: '', reasoningChars: 0 })

  const controller = new AbortController()
  let reason: 'user' | 'timeout' | null = null
  const timer = idleTimer(timeoutFor(effort), () => {
    reason = 'timeout'
    controller.abort()
  })
  const onUserAbort = () => {
    reason = 'user'
    controller.abort()
  }
  options.signal?.addEventListener('abort', onUserAbort, { once: true })

  try {
    const response = await fetch(buildEndpoint(settings), {
      method: 'POST',
      headers: buildHeaders(settings, stream),
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    timer.reset()

    if (!response.ok) {
      const raw = await response.text()
      let data: any = null
      try {
        data = JSON.parse(raw)
      } catch {
        data = null
      }
      const detail = errorDetail(data, raw)
      throw new ApiError(`HTTP ${response.status}${detail ? `: ${detail}` : ''}`, response.status)
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (stream && response.body && /event-stream/i.test(contentType)) {
      const { content, usage } = await readEventStream(response.body, timer, options)
      if (!content.trim()) throw new ApiError('El modelo no devolvió texto.')
      return {
        content,
        usage: readUsage(usage, selection.messages, systemPrompt, content),
        streamed: true,
      }
    }

    const raw = await response.text()
    let data: any = null
    try {
      data = JSON.parse(raw)
    } catch {
      data = null
    }
    if (!data) throw new ApiError('El servidor devolvió una respuesta inválida.')
    if (data.error) throw new ApiError(errorDetail(data, raw))
    const content = String(data?.choices?.[0]?.message?.content ?? '')
    if (!content.trim()) throw new ApiError('El modelo no devolvió texto.')
    options.onProgress?.({ content, reasoningChars: 0 })
    return {
      content,
      usage: readUsage(data.usage, selection.messages, systemPrompt, content),
      streamed: false,
    }
  } catch (error) {
    if (reason === 'user') throw new CancelledError()
    if (error instanceof ApiError || error instanceof CancelledError) throw error
    if (reason === 'timeout' || (error as Error)?.name === 'AbortError') {
      throw new ApiError('El modelo tardó demasiado en responder.', 408)
    }
    throw new ApiError(
      `No se pudo contactar al modelo: ${(error as Error)?.message ?? 'error de red'}`,
    )
  } finally {
    timer.clear()
    options.signal?.removeEventListener('abort', onUserAbort)
  }
}

async function readEventStream(
  body: ReadableStream<Uint8Array>,
  timer: { reset(): void },
  options: AttemptOptions,
): Promise<{ content: string; usage: unknown }> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const parser = new SseParser()
  let content = ''
  let reasoningChars = 0
  let usage: unknown = null
  let done = false

  const handle = (events: string[]) => {
    for (const event of events) {
      const payload = event.trim()
      if (!payload) continue
      if (payload === '[DONE]') {
        done = true
        continue
      }
      let data: any
      try {
        data = JSON.parse(payload)
      } catch {
        continue
      }
      const chunk = readStreamChunk(data)
      if (chunk.error) throw new ApiError(chunk.error)
      if (chunk.usage) usage = chunk.usage
      if (chunk.content || chunk.reasoning) {
        content += chunk.content
        reasoningChars += chunk.reasoning.length
        options.onProgress?.({ content, reasoningChars })
      }
    }
  }

  try {
    while (!done) {
      const { value, done: finished } = await reader.read()
      if (finished) break
      timer.reset()
      handle(parser.push(decoder.decode(value, { stream: true })))
    }
    handle(parser.push(decoder.decode()))
    handle(parser.flush())
  } finally {
    reader.cancel().catch(() => undefined)
  }
  return { content, usage }
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

/**
 * Pide un turno al modelo con los reintentos necesarios:
 * - sin `stream_options` o sin streaming si el servidor no los admite;
 * - sin `reasoning_effort` si el modelo no lo acepta;
 * - con menos razonamiento si el modelo no devolvió texto;
 * - con una ventana más pequeña si el historial excede la del modelo.
 */
export async function chatWithFallback(
  settings: Settings,
  systemPrompt: string,
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<ChatResult> {
  let effort: Reasoning | null = settings.reasoning
  let stream = Boolean(options.stream)
  let streamOptions = true
  let contextWindow = settings.contextWindow
  let adjustedWindow: number | undefined
  let lowered = false

  for (let attempt = 0; attempt < 7; attempt++) {
    try {
      const result = await chatOnce(
        { ...settings, contextWindow },
        systemPrompt,
        messages,
        effort,
        { ...options, stream, streamOptions },
      )
      return { ...result, contextWindow: adjustedWindow }
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      const text = error.message
      const clientError = error.code >= 400 && error.code < 500
      if (stream && streamOptions && clientError && /stream_options|include_usage/i.test(text)) {
        streamOptions = false
        continue
      }
      if (stream && clientError && error.code !== 401 && error.code !== 403 && /stream/i.test(text)) {
        stream = false
        continue
      }
      if (effort && error.code === 400 && /reasoning/i.test(text)) {
        effort = null
        continue
      }
      if (error.code === 0 && /no devolvió texto/i.test(text)) {
        if (effort === null) throw error
        effort = lowered ? null : nextEffort(effort)
        lowered = true
        continue
      }
      if (isContextError(text)) {
        const limit = contextLimitFromError(text)
        if (limit && limit < contextWindow) {
          contextWindow = limit
          adjustedWindow = limit
          continue
        }
      }
      throw error
    }
  }
  throw new ApiError('No se pudo obtener respuesta del modelo.')
}

/** Pide solo las 5 opciones que faltan, con razonamiento bajo y sin streaming. */
export async function requestMissingOptions(
  settings: Settings,
  systemPrompt: string,
  history: ChatMessage[],
  signal?: AbortSignal,
): Promise<string | null> {
  const result = await chatOnce(
    { ...settings, reasoning: 'low' },
    systemPrompt,
    history,
    'low',
    { signal },
  )
  return result.content
}

/**
 * Pide al modelo un dossier de contexto del mundo a partir del mundo y el tema.
 * Reporta el texto parcial mientras llega (con streaming).
 */
export async function generateLore(
  settings: Settings,
  options: { signal?: AbortSignal; onProgress?: (text: string) => void } = {},
): Promise<string> {
  // Recordar datos de una obra no necesita un razonamiento largo.
  const reasoning: Reasoning = ['low', 'medium'].includes(settings.reasoning) ? settings.reasoning : 'medium'
  const result = await chatWithFallback(
    { ...settings, reasoning },
    LORE_SYSTEM_PROMPT,
    [createMessage('user', loreRequest(settings))],
    {
      stream: settings.stream,
      signal: options.signal,
      onProgress: (progress) => options.onProgress?.(progress.content),
    },
  )
  const { lore, unknown } = cleanGeneratedLore(result.content)
  if (unknown) {
    throw new ApiError(
      'El modelo no conoce ese mundo. Pega aquí un resumen o escribe el contexto a mano.',
    )
  }
  if (!lore) throw new ApiError('El modelo no devolvió texto.')
  return lore
}

export interface ConnectionTest {
  ok: boolean
  message: string
}

/** Envía un mensaje mínimo para comprobar URL, key y modelo. */
export async function testConnection(settings: Settings): Promise<ConnectionTest> {
  if (requiresApiKey(settings.baseUrl) && !settings.apiKey.trim()) {
    return { ok: false, message: 'Falta la API key del proveedor.' }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 45_000)
  const started = performance.now()
  try {
    const response = await fetch(buildEndpoint(settings), {
      method: 'POST',
      headers: buildHeaders(settings, false),
      body: JSON.stringify({
        model: settings.model,
        messages: [{ role: 'user', content: 'Responde solo: ok' }],
      }),
      signal: controller.signal,
    })
    const elapsed = Math.round(performance.now() - started)
    if (response.ok) {
      return { ok: true, message: `Conexión correcta con ${settings.model} (${elapsed} ms).` }
    }
    const raw = await response.text()
    let data: any = null
    try {
      data = JSON.parse(raw)
    } catch {
      data = null
    }
    const detail = errorDetail(data, raw)
    if (response.status === 401 || response.status === 403) {
      return { ok: false, message: `La API key fue rechazada (HTTP ${response.status}).` }
    }
    if (response.status === 404) {
      return { ok: false, message: `No se encontró el endpoint o el modelo (HTTP 404). ${detail}`.trim() }
    }
    return { ok: false, message: `HTTP ${response.status}: ${detail}` }
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      return { ok: false, message: 'El servidor no respondió en 45 segundos.' }
    }
    return {
      ok: false,
      message:
        'No se pudo conectar. Revisa la URL base, tu conexión o si el servidor permite CORS.',
    }
  } finally {
    clearTimeout(timer)
  }
}
