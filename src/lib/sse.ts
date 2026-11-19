/**
 * Parser incremental de Server-Sent Events. Recibe fragmentos de texto tal como
 * llegan del stream y devuelve el `data` de cada evento completo.
 */
export class SseParser {
  private buffer = ''
  private dataLines: string[] = []

  push(chunk: string): string[] {
    this.buffer += chunk
    const events: string[] = []
    let newline = this.buffer.search(/\r?\n|\r/)
    while (newline !== -1) {
      // Un \r al final del fragmento puede ser la mitad de un \r\n: espera al siguiente.
      if (newline === this.buffer.length - 1 && this.buffer.endsWith('\r')) break
      const breakLength = this.buffer.startsWith('\r\n', newline) ? 2 : 1
      const line = this.buffer.slice(0, newline)
      this.buffer = this.buffer.slice(newline + breakLength)
      this.line(line, events)
      newline = this.buffer.search(/\r?\n|\r/)
    }
    return events
  }

  /** Cierra el stream: entrega el último evento aunque no termine en línea vacía. */
  flush(): string[] {
    const events: string[] = []
    if (this.buffer) {
      this.line(this.buffer, events)
      this.buffer = ''
    }
    this.dispatch(events)
    return events
  }

  private line(line: string, events: string[]) {
    if (line === '') {
      this.dispatch(events)
      return
    }
    if (line.startsWith(':')) return
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    if (field !== 'data') return
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    this.dataLines.push(value)
  }

  private dispatch(events: string[]) {
    if (!this.dataLines.length) return
    events.push(this.dataLines.join('\n'))
    this.dataLines = []
  }
}

export interface StreamChunk {
  content: string
  reasoning: string
  usage: Record<string, unknown> | null
  error: string | null
}

/** Extrae texto, razonamiento, uso y errores de un chunk OpenAI-compatible. */
export function readStreamChunk(data: any): StreamChunk {
  const choice = data?.choices?.[0]
  const delta = choice?.delta ?? {}
  const content =
    typeof delta.content === 'string'
      ? delta.content
      : typeof choice?.message?.content === 'string'
        ? choice.message.content
        : ''
  let reasoning = ''
  if (typeof delta.reasoning_content === 'string') reasoning = delta.reasoning_content
  else if (typeof delta.reasoning === 'string') reasoning = delta.reasoning
  else if (Array.isArray(delta.reasoning_details)) {
    reasoning = delta.reasoning_details
      .map((item: any) => (typeof item?.text === 'string' ? item.text : ''))
      .join('')
  }
  const usage = data?.usage && typeof data.usage === 'object' ? data.usage : null
  let error: string | null = null
  if (data?.error) {
    error =
      typeof data.error === 'string'
        ? data.error
        : String(data.error.message ?? data.error.type ?? 'error del proveedor')
  }
  return { content, reasoning, usage, error }
}

/**
 * Busca en un mensaje de error el tamaño máximo de contexto del modelo.
 * Reconoce los formatos de OpenAI, Anthropic y servidores compatibles.
 */
export function contextLimitFromError(message: string): number | null {
  const patterns = [
    /maximum context length is\s*([\d][\d,._ ]*)/i,
    /context (?:window|length|limit)(?: of| is| exceeded[^\d]*)?\s*([\d][\d,._ ]*)\s*tokens/i,
    /[\d][\d,._]*\s*tokens?\s*>\s*([\d][\d,._]*)\s*(?:tokens?\s*)?maximum/i,
    /maximum[^\d]{0,40}([\d][\d,._]*)\s*tokens/i,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(message)
    if (!match) continue
    const value = Number(match[1].replace(/[\s,._]/g, ''))
    if (Number.isFinite(value) && value >= 1_000) return value
  }
  return null
}

export function isContextError(message: string): boolean {
  return /context|longitud|too long|maximum context|prompt is too long|token limit/i.test(message)
}
