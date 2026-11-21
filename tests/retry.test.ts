import { describe, expect, it } from 'vitest'
import { ApiError, CancelledError } from '../src/lib/api'
import { AGENT_ATTEMPTS, abortableSleep, isRetryable, withRetries } from '../src/lib/retry'

const noWait = async () => undefined

describe('Reintentos automáticos de los agentes', () => {
  it('distingue los fallos pasajeros de los permanentes', () => {
    expect(isRetryable(new ApiError('sin texto'))).toBe(true) // código 0
    expect(isRetryable(new ApiError('tardó demasiado', 408))).toBe(true)
    expect(isRetryable(new ApiError('saturado', 429))).toBe(true)
    expect(isRetryable(new ApiError('proveedor', 500))).toBe(true)
    expect(isRetryable(new ApiError('gateway', 504))).toBe(true)
    expect(isRetryable(new ApiError('key', 401))).toBe(false)
    expect(isRetryable(new ApiError('prohibido', 403))).toBe(false)
    expect(isRetryable(new ApiError('modelo', 404))).toBe(false)
    expect(isRetryable(new ApiError('petición', 400))).toBe(false)
    expect(isRetryable(new CancelledError())).toBe(false)
    expect(isRetryable(new Error('bug'))).toBe(false)
  })

  it('devuelve el resultado sin esperar si sale bien a la primera', async () => {
    let calls = 0
    const result = await withRetries(async () => ++calls, { sleep: noWait })
    expect(result).toBe(1)
  })

  it('repite tras un fallo pasajero y acaba en éxito', async () => {
    let calls = 0
    const waits: number[] = []
    const result = await withRetries(
      async () => {
        calls++
        if (calls < 3) throw new ApiError('proveedor', 503)
        return 'ok'
      },
      { sleep: async (ms) => void waits.push(ms) },
    )
    expect(result).toBe('ok')
    expect(calls).toBe(3)
    expect(waits).toEqual([2000, 5000])
  })

  it('tras agotar los intentos lanza el último error', async () => {
    let calls = 0
    await expect(
      withRetries(
        async () => {
          calls++
          throw new ApiError(`fallo ${calls}`, 500)
        },
        { sleep: noWait },
      ),
    ).rejects.toThrow('fallo 3')
    expect(calls).toBe(AGENT_ATTEMPTS)
  })

  it('no repite un error permanente', async () => {
    let calls = 0
    await expect(
      withRetries(
        async () => {
          calls++
          throw new ApiError('key rechazada', 401)
        },
        { sleep: noWait },
      ),
    ).rejects.toThrow('key rechazada')
    expect(calls).toBe(1)
  })

  it('avisa de cada intento', async () => {
    const seen: string[] = []
    let calls = 0
    await withRetries(
      async () => {
        if (++calls < 2) throw new ApiError('x', 500)
      },
      { sleep: noWait, onAttempt: (n, total) => seen.push(`${n}/${total}`) },
    )
    expect(seen).toEqual(['1/3', '2/3'])
  })

  it('cancelar interrumpe la espera y no sigue intentando', async () => {
    const controller = new AbortController()
    let calls = 0
    const pending = withRetries(
      async () => {
        calls++
        throw new ApiError('x', 500)
      },
      { delays: [60_000], signal: controller.signal },
    )
    await new Promise((resolve) => setTimeout(resolve, 10))
    controller.abort()
    await expect(pending).rejects.toBeInstanceOf(CancelledError)
    expect(calls).toBe(1)
  })

  it('abortableSleep respeta una señal ya cancelada', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(abortableSleep(1000, controller.signal)).rejects.toBeInstanceOf(CancelledError)
  })
})
