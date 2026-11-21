import type { ProgressFile } from './transfer'
import { parseProgressJson } from './transfer'

/**
 * La nube usa la API REST de Firebase Realtime Database por HTTPS (sin el SDK): funciona en
 * cualquier red que deje salir HTTPS, no cuelga la interfaz cuando no hay conexión y no pesa
 * en el bundle. Solo hace falta la URL de la base; el despliegue (o `.env.local`) decide si
 * la nube está disponible.
 */
function databaseUrl(): string {
  return (import.meta.env.VITE_FIREBASE_DATABASE_URL ?? '').trim().replace(/\/+$/, '')
}

export const cloudConfigured = Boolean(databaseUrl())

export const CLOUD_APP = 'dungeon-ai-web'
export const CLOUD_VERSION = 1
export const CLOUD_PATH = 'saves'
export const SYNC_CODE_LENGTH = 32
const SYNC_CODE_PATTERN = /^[a-f0-9]{32}$/

export interface CloudSnapshot {
  progress: ProgressFile
  updatedAt: number
}

/** Genera 128 bits aleatorios en hexadecimal. El código es la llave de la partida. */
export function newSyncCode(): string {
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    throw new Error('Este navegador no puede generar un código seguro.')
  }
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Acepta el código con guiones, espacios o mayúsculas; lo devuelve canónico. */
export function normalizeSyncCode(value: string): string {
  return value.toLowerCase().replace(/[^a-f0-9]/g, '').slice(0, SYNC_CODE_LENGTH)
}

export function isValidSyncCode(value: string): boolean {
  return SYNC_CODE_PATTERN.test(value)
}

/** Presentación en grupos de 8 para copiarlo a mano sin errores. */
export function formatSyncCode(code: string): string {
  const clean = normalizeSyncCode(code)
  return clean.match(/.{1,8}/g)?.join('-') ?? clean
}

export function cloudPath(code: string): string {
  if (!isValidSyncCode(code)) throw new Error('El código de sincronización no es válido.')
  return `${CLOUD_PATH}/${code}`
}

/** Valida y normaliza lo que hay en la base; devuelve null si no es una partida nuestra. */
export function parseCloudSnapshot(value: unknown): CloudSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (raw.app !== CLOUD_APP) return null
  if (!raw.progress || typeof raw.progress !== 'object') return null
  try {
    const progress = parseProgressJson(JSON.stringify(raw.progress))
    const at = Number(raw.updatedAt)
    return {
      progress,
      updatedAt: Number.isFinite(at) && at > 0 ? at : 0,
    }
  } catch {
    return null
  }
}

/** Tiempo máximo de cada petición. Con red lenta o bloqueada, la interfaz no se queda esperando para siempre. */
export const CLOUD_REQUEST_TIMEOUT_MS = 15_000
/** Cada cuánto se consulta si otro dispositivo guardó una versión más nueva. */
export const CLOUD_POLL_MS = 45_000

function restUrl(code: string, leaf = ''): string {
  const base = databaseUrl()
  if (!base) throw new Error('Falta la configuración de Firebase.')
  return `${base}/${cloudPath(code)}${leaf ? `/${leaf}` : ''}.json`
}

/** Petición a la API REST de Realtime Database con tiempo límite. Devuelve el JSON (o null). */
async function restFetch(url: string, init: RequestInit = {}): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CLOUD_REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' })
    if (response.status === 401 || response.status === 403) {
      throw new Error(`permission denied (HTTP ${response.status})`)
    }
    // Los mensajes con «network» se tratan como fallo de conexión (se reintenta solo, sin alarmar).
    if (response.status >= 500) throw new Error(`network: Firebase respondió HTTP ${response.status}`)
    if (!response.ok) throw new Error(`Firebase respondió HTTP ${response.status}`)
    const text = await response.text()
    return text ? JSON.parse(text) : null
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      throw new Error(`network: Firebase no respondió en ${Math.round(CLOUD_REQUEST_TIMEOUT_MS / 1000)} s`)
    }
    if (error instanceof TypeError) throw new Error(`network: no se pudo alcanzar Firebase (${error.message})`)
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function read(code: string): Promise<CloudSnapshot | null> {
  const value = await restFetch(restUrl(code))
  return value == null ? null : parseCloudSnapshot(value)
}

async function write(code: string, progress: ProgressFile): Promise<number> {
  const updatedAt = Date.now()
  await restFetch(restUrl(code), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app: CLOUD_APP, version: CLOUD_VERSION, updatedAt, progress }),
  })
  return updatedAt
}

/** Marca de tiempo del último guardado remoto (sin descargar la partida entera). */
async function updatedAtOf(code: string): Promise<number> {
  const value = await restFetch(restUrl(code, 'updatedAt'))
  const at = Number(value)
  return Number.isFinite(at) && at > 0 ? at : 0
}

/** Sustituible en las pruebas. */
export const backends = { read, write, updatedAtOf }

export function readCloudSnapshot(code: string): Promise<CloudSnapshot | null> {
  return backends.read(code)
}

/** Guarda el progreso sin API key y devuelve la marca de tiempo del guardado. */
export function writeCloudSnapshot(code: string, progress: ProgressFile): Promise<number> {
  return backends.write(code, progress)
}

export interface CloudWatchHandlers {
  onSnapshot: (snapshot: CloudSnapshot | null) => void
  onError?: (error: unknown) => void
}

/**
 * Consulta periódicamente la marca de tiempo del guardado remoto y solo descarga la partida si
 * cambió. Se pausa con la pestaña oculta. Devuelve la función para dejar de consultar.
 */
export function watchCloudSnapshot(code: string, handlers: CloudWatchHandlers, intervalMs = CLOUD_POLL_MS): () => void {
  let stopped = false
  let seen = 0
  let busy = false
  const tick = async () => {
    if (stopped || busy) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    busy = true
    try {
      const at = await backends.updatedAtOf(code)
      if (stopped || !at || at === seen) return
      const snapshot = await backends.read(code)
      if (stopped) return
      seen = at
      handlers.onSnapshot(snapshot)
    } catch (error) {
      // Un fallo puntual de red no cambia el estado; se vuelve a intentar en el siguiente ciclo.
      if (!/network/i.test((error as Error)?.message ?? '')) handlers.onError?.(error)
    } finally {
      busy = false
    }
  }
  void tick()
  const timer = setInterval(() => void tick(), intervalMs)
  return () => {
    stopped = true
    clearInterval(timer)
  }
}
