import type { ProgressFile } from './transfer'
import { parseProgressJson } from './transfer'
import { loadDatabase } from './firebase'

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
export const CLOUD_TIMEOUTS = { load: 15_000, read: 12_000, write: 15_000 }

/** Rechaza si `promise` no termina en `ms`. El mensaje contiene «network» para que se trate como fallo de red. */
export function withTimeout<T>(promise: Promise<T>, ms: number, what = 'Firebase'): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`network: ${what} no respondió en ${Math.round(ms / 1000)} s`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

export async function readCloudSnapshot(code: string): Promise<CloudSnapshot | null> {
  const db = await withTimeout(loadDatabase(), CLOUD_TIMEOUTS.load, 'Cargar Firebase')
  if (!db) throw new Error('Falta la configuración de Firebase.')
  const { get, ref } = await import('firebase/database')
  const snapshot = await withTimeout(get(ref(db, cloudPath(code))), CLOUD_TIMEOUTS.read, 'La lectura de Firebase')
  return snapshot.exists() ? parseCloudSnapshot(snapshot.val()) : null
}

/** Guarda el progreso sin API key y devuelve la marca de tiempo del guardado. */
export async function writeCloudSnapshot(code: string, progress: ProgressFile): Promise<number> {
  const db = await withTimeout(loadDatabase(), CLOUD_TIMEOUTS.load, 'Cargar Firebase')
  if (!db) throw new Error('Falta la configuración de Firebase.')
  const { ref, set } = await import('firebase/database')
  const updatedAt = Date.now()
  // Sin conexión, `set` queda en cola y no resuelve: tras el límite se da por fallido y el siguiente guardado lo repite.
  await withTimeout(
    set(ref(db, cloudPath(code)), {
      app: CLOUD_APP,
      version: CLOUD_VERSION,
      updatedAt,
      progress,
    }),
    CLOUD_TIMEOUTS.write,
    'El guardado en Firebase',
  )
  return updatedAt
}

export interface CloudWatchHandlers {
  onSnapshot: (snapshot: CloudSnapshot | null) => void
  onError?: (error: unknown) => void
}

/** Escucha cambios remotos. Devuelve la función para dejar de escuchar. */
export async function watchCloudSnapshot(
  code: string,
  handlers: CloudWatchHandlers,
): Promise<() => void> {
  const db = await withTimeout(loadDatabase(), CLOUD_TIMEOUTS.load, 'Cargar Firebase')
  if (!db) throw new Error('Falta la configuración de Firebase.')
  const { onValue, ref } = await import('firebase/database')
  return onValue(
    ref(db, cloudPath(code)),
    (snapshot) => handlers.onSnapshot(parseCloudSnapshot(snapshot.val())),
    (error) => handlers.onError?.(error),
  )
}


