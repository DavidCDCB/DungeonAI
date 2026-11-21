import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLOUD_TIMEOUTS, withTimeout } from '../src/lib/cloud'

describe('Tiempo límite de las llamadas a Firebase', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('devuelve el resultado si llega a tiempo', async () => {
    const result = withTimeout(new Promise<string>((resolve) => setTimeout(() => resolve('ok'), 500)), 2000)
    await vi.advanceTimersByTimeAsync(600)
    await expect(result).resolves.toBe('ok')
  })

  it('rechaza si Firebase no responde (promesa colgada) y lo marca como fallo de red', async () => {
    const hung = new Promise<never>(() => undefined)
    const result = withTimeout(hung, CLOUD_TIMEOUTS.read, 'La lectura de Firebase')
    const assertion = expect(result).rejects.toThrow(new RegExp(`network.*La lectura de Firebase.*${CLOUD_TIMEOUTS.read / 1000} s`))
    await vi.advanceTimersByTimeAsync(CLOUD_TIMEOUTS.read + 10)
    await assertion
  })

  it('propaga el error original si la promesa falla antes del límite', async () => {
    const result = withTimeout(Promise.reject(new Error('permission denied')), 5000)
    await expect(result).rejects.toThrow('permission denied')
  })

  it('no deja temporizadores pendientes tras resolver', async () => {
    await withTimeout(Promise.resolve(1), 5000)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('los límites son razonables para una conexión móvil lenta', () => {
    expect(CLOUD_TIMEOUTS.read).toBeGreaterThanOrEqual(8_000)
    expect(CLOUD_TIMEOUTS.write).toBeGreaterThanOrEqual(CLOUD_TIMEOUTS.read)
    expect(CLOUD_TIMEOUTS.write).toBeLessThanOrEqual(30_000)
  })
})
