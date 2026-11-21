import { ApiError, CancelledError } from './api'

/** Esperas entre intentos de los agentes en segundo plano: 3 intentos en total. */
export const AGENT_RETRY_DELAYS = [2000, 5000]
export const AGENT_ATTEMPTS = AGENT_RETRY_DELAYS.length + 1

/**
 * ¿Merece la pena repetir? Sí con fallos pasajeros (red, tiempo agotado, 429, 5xx, respuesta
 * vacía o inválida); no si el problema persistirá igual: credenciales, URL o modelo erróneos,
 * petición rechazada o cancelada por el usuario.
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof CancelledError) return false
  if (!(error instanceof ApiError)) return false
  if (error.code === 408 || error.code === 429) return true
  if (error.code >= 400 && error.code < 500) return false
  return true
}

/** Espera `ms` milisegundos; si se cancela antes, lanza CancelledError. */
export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new CancelledError())
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      reject(new CancelledError())
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export interface RetryOptions {
  delays?: number[]
  signal?: AbortSignal
  /** Se llama al empezar cada intento (1 = el primero). */
  onAttempt?: (attempt: number, total: number) => void
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
}

/** Ejecuta `task` y lo repite tras un fallo recuperable, con espera entre intentos. */
export async function withRetries<T>(task: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const delays = options.delays ?? AGENT_RETRY_DELAYS
  const sleep = options.sleep ?? abortableSleep
  for (let attempt = 0; ; attempt++) {
    options.onAttempt?.(attempt + 1, delays.length + 1)
    try {
      return await task()
    } catch (error) {
      if (options.signal?.aborted) throw error instanceof CancelledError ? error : new CancelledError()
      if (attempt >= delays.length || !isRetryable(error)) throw error
      await sleep(delays[attempt], options.signal)
    }
  }
}
