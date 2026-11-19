import { describe, expect, it } from 'vitest'
import { SseParser, contextLimitFromError, readStreamChunk } from '../src/lib/sse'

describe('SseParser', () => {
  it('une fragmentos partidos en cualquier punto', () => {
    const parser = new SseParser()
    const stream = 'data: {"a":1}\n\ndata: {"b":2}\n\n: keepalive\n\ndata: [DONE]\n\n'
    const events: string[] = []
    for (let i = 0; i < stream.length; i += 3) {
      events.push(...parser.push(stream.slice(i, i + 3)))
    }
    events.push(...parser.flush())
    expect(events).toEqual(['{"a":1}', '{"b":2}', '[DONE]'])
  })

  it('acepta CRLF partido entre fragmentos y datos multilínea', () => {
    const parser = new SseParser()
    const events = [
      ...parser.push('data: uno\r'),
      ...parser.push('\ndata: dos\r\n\r\n'),
      ...parser.flush(),
    ]
    expect(events).toEqual(['uno\ndos'])
  })

  it('entrega el último evento aunque falte la línea vacía', () => {
    const parser = new SseParser()
    expect(parser.push('data: final')).toEqual([])
    expect(parser.flush()).toEqual(['final'])
  })
})

describe('readStreamChunk', () => {
  it('lee contenido, razonamiento y uso', () => {
    expect(readStreamChunk({ choices: [{ delta: { content: 'Hola' } }] }).content).toBe('Hola')
    expect(readStreamChunk({ choices: [{ delta: { reasoning_content: 'pienso' } }] }).reasoning).toBe(
      'pienso',
    )
    expect(readStreamChunk({ choices: [{ delta: { reasoning: 'r' } }] }).reasoning).toBe('r')
    const usage = readStreamChunk({ choices: [], usage: { prompt_tokens: 10 } }).usage
    expect(usage).toEqual({ prompt_tokens: 10 })
  })

  it('detecta errores dentro del stream', () => {
    expect(readStreamChunk({ error: { message: 'sobrecargado' } }).error).toBe('sobrecargado')
  })
})

describe('contextLimitFromError', () => {
  it('reconoce el formato de OpenAI', () => {
    expect(
      contextLimitFromError(
        "This model's maximum context length is 128000 tokens. However, your messages resulted in 130512 tokens.",
      ),
    ).toBe(128_000)
  })

  it('reconoce el formato de Anthropic', () => {
    expect(contextLimitFromError('prompt is too long: 210345 tokens > 200000 maximum')).toBe(200_000)
  })

  it('no confunde otros errores', () => {
    expect(contextLimitFromError('max_tokens: 64000 > 8192, which is the maximum allowed')).toBeNull()
    expect(contextLimitFromError('Invalid credential')).toBeNull()
  })
})
