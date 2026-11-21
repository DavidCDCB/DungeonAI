import type { ProgressFile } from './transfer'
import { parseProgressJson } from './transfer'
import { firebaseConfig, loadDatabase } from './firebase'

export { cloudConfigured } from './firebase'

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

/**
 * Tiempos máximos de espera. El SDK de Firebase no rechaza una lectura o una escritura mientras
 * no hay conexión (queda a la espera de que vuelva la red), así que sin esto la interfaz se
 * quedaba en «Conectando…» y el guardado bloqueado para siempre.
 */
export const CLOUD_TIMEOUTS = { load: 12_000, read: 8_000, write: 10_000, rest: 15_000 }

/** Rechaza si `promise` no termina en `ms`. El mensaje contiene «network» para que se trate como fallo de red. */
export function withTimeout<T>(promise: Promise<T>, ms: number, what = 'Firebase'): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`network: ${what} no respondió en ${Math.round(ms / 1000)} s`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

// ---------------------------------------------------------------------------
// Transporte: SDK (WebSocket) y, si no conecta, la API REST por HTTPS
// ---------------------------------------------------------------------------

export type CloudTransport = 'sdk' | 'rest'

/** Tras un fallo de red del SDK (p. ej. WebSocket bloqueado) la sesión sigue por HTTPS. */
let sdkDown = false

export function cloudTransport(): CloudTransport {
  return sdkDown ? 'rest' : 'sdk'
}

/** Solo para pruebas. */
export function resetCloudTransport() {
  sdkDown = false
}

/** ¿Es un fallo de conexión (se puede probar otro camino) y no un rechazo de reglas o de datos? */
export function isNetworkFailure(error: unknown): boolean {
  const text = (error as Error)?.message ?? ''
  if (/permission|denied|validation|invalid data|not valid/i.test(text)) return false
  return /network|offline|unavailable|failed to (get|fetch)|timed? ?out|load failed/i.test(text)
}

/**
 * Deja el SDK sin conexión para que no vacíe más tarde una escritura atrasada (antigua) por
 * encima de lo que ya se guardó por HTTPS.
 */
async function parkSdk() {
  try {
    const db = await withTimeout(loadDatabase(), 2_000, 'Firebase')
    if (!db) return
    const { goOffline } = await import('firebase/database')
    goOffline(db)
  } catch {
    // Sin SDK no hay nada que aparcar.
  }
}

function restUrl(code: string, leaf = ''): string {
  const base = firebaseConfig?.databaseURL?.replace(/\/+$/, '')
  if (!base) throw new Error('Falta la configuración de Firebase.')
  return `${base}/${cloudPath(code)}${leaf ? `/${leaf}` : ''}.json`
}

/** Petición a la API REST de Realtime Database con tiempo límite. Devuelve el JSON (o null). */
async function restFetch(url: string, init: RequestInit = {}): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CLOUD_TIMEOUTS.rest)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' })
    if (response.status === 401 || response.status === 403) throw new Error('permission denied (HTTP ' + response.status + ')')
    if (response.status >= 500) throw new Error(`network: Firebase respondió HTTP ${response.status}`)
    if (!response.ok) throw new Error(`Firebase respondió HTTP ${response.status}`)
    const text = await response.text()
    return text ? JSON.parse(text) : null
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw new Error(`network: Firebase (HTTPS) no respondió en ${Math.round(CLOUD_TIMEOUTS.rest / 1000)} s`)
    if (error instanceof TypeError) throw new Error(`network: no se pudo alcanzar Firebase por HTTPS (${error.message})`)
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function sdkRead(code: string): Promise<CloudSnapshot | null> {
  const db = await withTimeout(loadDatabase(), CLOUD_TIMEOUTS.load, 'Cargar Firebase')
  if (!db) throw new Error('Falta la configuración de Firebase.')
  const { get, ref } = await import('firebase/database')
  const snapshot = await withTimeout(get(ref(db, cloudPath(code))), CLOUD_TIMEOUTS.read, 'La lectura de Firebase')
  return snapshot.exists() ? parseCloudSnapshot(snapshot.val()) : null
}

async function sdkWrite(code: string, progress: ProgressFile): Promise<number> {
  const db = await withTimeout(loadDatabase(), CLOUD_TIMEOUTS.load, 'Cargar Firebase')
  if (!db) throw new Error('Falta la configuración de Firebase.')
  const { ref, set } = await import('firebase/database')
  const updatedAt = Date.now()
  // Sin conexión, `set` queda en cola y no resuelve: tras el límite se da por fallido.
  await withTimeout(
    set(ref(db, cloudPath(code)), { app: CLOUD_APP, version: CLOUD_VERSION, updatedAt, progress }),
    CLOUD_TIMEOUTS.write,
    'El guardado en Firebase',
  )
  return updatedAt
}

async function restRead(code: string): Promise<CloudSnapshot | null> {
  const value = await restFetch(restUrl(code))
  return value == null ? null : parseCloudSnapshot(value)
}

async function restWrite(code: string, progress: ProgressFile): Promise<number> {
  const updatedAt = Date.now()
  await restFetch(restUrl(code), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app: CLOUD_APP, version: CLOUD_VERSION, updatedAt, progress }),
  })
  return updatedAt
}

/** Marca de tiempo del último guardado remoto (sin descargar la partida entera). */
async function restUpdatedAt(code: string): Promise<number> {
  const value = await restFetch(restUrl(code, 'updatedAt'))
  const at = Number(value)
  return Number.isFinite(at) && at > 0 ? at : 0
}

/** Los tres caminos son sustituibles en las pruebas. */
export const backends = { sdkRead, sdkWrite, restRead, restWrite, restUpdatedAt, parkSdk }

/**
 * Prueba primero el SDK; si falla por la red, aparca el SDK y repite por HTTPS. Los rechazos de
 * reglas o de datos no cambian de camino.
 */
async function withFallback<T>(viaSdk: () => Promise<T>, viaRest: () => Promise<T>): Promise<T> {
  if (!sdkDown) {
    try {
      return await viaSdk()
    } catch (error) {
      if (!isNetworkFailure(error)) throw error
      sdkDown = true
      void backends.parkSdk()
    }
  }
  return viaRest()
}

export function readCloudSnapshot(code: string): Promise<CloudSnapshot | null> {
  return withFallback(
    () => backends.sdkRead(code),
    () => backends.restRead(code),
  )
}

/** Guarda el progreso sin API key y devuelve la marca de tiempo del guardado. */
export function writeCloudSnapshot(code: string, progress: ProgressFile): Promise<number> {
  return withFallback(
    () => backends.sdkWrite(code, progress),
    () => backends.restWrite(code, progress),
  )
}

export interface CloudWatchHandlers {
  onSnapshot: (snapshot: CloudSnapshot | null) => void
  onError?: (error: unknown) => void
}

/**
 * Sin el SDK no hay avisos en vivo: se consulta la marca de tiempo cada `intervalMs` y solo se
 * descarga la partida si cambió.
 */
export function pollCloudSnapshot(code: string, handlers: CloudWatchHandlers, intervalMs = 45_000): () => void {
  let stopped = false
  let seen = 0
  let busy = false
  const tick = async () => {
    if (stopped || busy) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    busy = true
    try {
      const at = await backends.restUpdatedAt(code)
      if (stopped || !at || at === seen) return
      const snapshot = await backends.restRead(code)
      if (stopped) return
      seen = at
      handlers.onSnapshot(snapshot)
    } catch {
      // Un fallo puntual de red no cambia el estado; se vuelve a intentar en el siguiente ciclo.
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

/** Escucha cambios remotos. Devuelve la función para dejar de escuchar. */
export async function watchCloudSnapshot(code: string, handlers: CloudWatchHandlers): Promise<() => void> {
  if (sdkDown) return pollCloudSnapshot(code, handlers)
  const db = await withTimeout(loadDatabase(), CLOUD_TIMEOUTS.load, 'Cargar Firebase')
  if (!db) throw new Error('Falta la configuración de Firebase.')
  const { onValue, ref } = await import('firebase/database')
  return onValue(
    ref(db, cloudPath(code)),
    (snapshot) => handlers.onSnapshot(parseCloudSnapshot(snapshot.val())),
    (error) => handlers.onError?.(error),
  )
}
