/**
 * Persistencia de la partida en IndexedDB (idb-keyval).
 *
 * - `initStorage()` abre la base, carga todo a una caché en memoria y, la primera vez,
 *   migra lo que hubiera en localStorage (versiones anteriores de la app). Debe
 *   terminar antes de importar `useGame`, que lee de la caché de forma síncrona.
 * - Las lecturas (`load*`) salen de la caché; las escrituras (`save*`) actualizan la
 *   caché al instante y se confirman en IndexedDB en una sola transacción por lote.
 *   Devuelven una promesa con `true` si quedaron guardadas.
 * - Cada mensaje es un registro propio (`msg:<id>`) más un índice con el orden:
 *   en cada turno solo se escribe lo que cambió, no toda la conversación.
 */
import { createStore, entries, promisifyRequest, type UseStore } from 'idb-keyval'
import type { ChatMessage, DiceGroup, Settings, TokenUsage } from '../types'
import { normalizeDiceGroups } from './dice'
import { createMessage } from './messages'
import { normalizeSettings } from './transfer'

const DB_NAME = 'dungeon-ai-web'
const STORE_NAME = 'kv'
const SCHEMA_KEY = 'meta:schema'
const SCHEMA_VERSION = 2
const MESSAGE_PREFIX = 'msg:'
const INDEX_KEY = 'messages'
const LEGACY_PREFIX = 'dungeon-ai-web:'
const LEGACY_KEYS = ['settings', 'messages', 'state', 'usage', 'dice', 'draft']

type Op = { key: string; value: unknown } | { key: string; remove: true }

interface StoredMessage {
  id?: string
  role?: string
  content?: string
  memory?: unknown
}

let store: UseStore | null = null
let cache = new Map<string, unknown>()
let pending = new Map<string, Op>()
let scheduled: Promise<boolean> | null = null
let chain: Promise<void> = Promise.resolve()
let ready = false

// ---------------------------------------------------------------------------
// Mensajes (formato en disco)
// ---------------------------------------------------------------------------

export function toStoredMessage(message: ChatMessage): StoredMessage {
  const stored: StoredMessage = { id: message.id, role: message.role, content: message.content }
  if (message.role === 'assistant' && typeof message.memory === 'string') {
    stored.memory = message.memory
  }
  return stored
}

export function fromStoredMessage(item: StoredMessage): ChatMessage | null {
  if (item?.role !== 'user' && item?.role !== 'assistant') return null
  const id = typeof item.id === 'string' && item.id ? item.id : undefined
  const message = createMessage(item.role, String(item.content ?? ''), id)
  if (item.role === 'assistant' && typeof item.memory === 'string') {
    message.memory = item.memory
  }
  return message
}

function sameStored(a: StoredMessage, b: StoredMessage): boolean {
  return a.role === b.role && a.content === b.content && a.memory === b.memory
}

// ---------------------------------------------------------------------------
// Apertura y migración
// ---------------------------------------------------------------------------

function defaultLegacy(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** Lee el formato antiguo (localStorage) y lo devuelve ya en el formato nuevo. */
function readLegacy(legacy: Storage | null): Map<string, unknown> {
  const out = new Map<string, unknown>()
  if (!legacy) return out
  const raw = (key: string): string | null => {
    try {
      return legacy.getItem(`${LEGACY_PREFIX}${key}`)
    } catch {
      return null
    }
  }
  const json = (key: string): unknown => {
    const text = raw(key)
    if (!text) return undefined
    try {
      return JSON.parse(text)
    } catch {
      return undefined
    }
  }

  const settings = json('settings')
  if (settings && typeof settings === 'object' && !Array.isArray(settings)) out.set('settings', settings)

  const messages = json('messages')
  if (Array.isArray(messages)) {
    const ids: string[] = []
    for (const item of messages) {
      const message = fromStoredMessage(item as StoredMessage)
      if (!message) continue
      ids.push(message.id)
      out.set(`${MESSAGE_PREFIX}${message.id}`, toStoredMessage(message))
    }
    if (ids.length) out.set(INDEX_KEY, ids)
  }

  const state = raw('state')
  if (state?.trim()) out.set('state', state)
  const usage = json('usage')
  if (usage && typeof usage === 'object' && !Array.isArray(usage)) out.set('usage', usage)
  const dice = json('dice')
  if (Array.isArray(dice)) out.set('dice', dice)
  const draft = raw('draft')
  if (draft) out.set('draft', draft)
  return out
}

function removeLegacy(legacy: Storage | null) {
  if (!legacy) return
  for (const key of LEGACY_KEYS) {
    try {
      legacy.removeItem(`${LEGACY_PREFIX}${key}`)
    } catch {
      // No es esencial: la migración ya quedó marcada en IndexedDB.
    }
  }
}

async function commit(ops: Op[]): Promise<void> {
  if (!store) throw new Error('IndexedDB no está disponible')
  await store('readwrite', (objectStore) => {
    for (const op of ops) {
      if ('remove' in op) objectStore.delete(op.key)
      else objectStore.put(op.value, op.key)
    }
    return promisifyRequest(objectStore.transaction)
  })
}

async function migrateLegacy(legacy: Storage | null) {
  const imported = readLegacy(legacy)
  const ops: Op[] = [...imported].map(([key, value]) => ({ key, value }))
  ops.push({ key: SCHEMA_KEY, value: SCHEMA_VERSION })
  await commit(ops)
  for (const [key, value] of imported) cache.set(key, value)
  cache.set(SCHEMA_KEY, SCHEMA_VERSION)
  // Solo se borra el origen cuando IndexedDB confirmó la transacción.
  removeLegacy(legacy)
}

/**
 * Abre IndexedDB y carga la partida. Nunca lanza: si IndexedDB no está disponible,
 * la app arranca con lo que haya en localStorage (solo lectura) y avisa al guardar.
 */
export async function initStorage(legacy: Storage | null = defaultLegacy()): Promise<void> {
  if (ready) return
  try {
    store = createStore(DB_NAME, STORE_NAME)
    cache = new Map(await entries<string, unknown>(store))
    if (cache.get(SCHEMA_KEY) !== SCHEMA_VERSION) await migrateLegacy(legacy)
  } catch {
    store = null
    cache = readLegacy(legacy)
  }
  pending = new Map()
  ready = true
}

/** Solo para pruebas: descarta el estado interno y la caché. */
export function resetStorageForTests() {
  store = null
  cache = new Map()
  pending = new Map()
  scheduled = null
  chain = Promise.resolve()
  ready = false
}

function assertReady() {
  if (!ready) throw new Error('initStorage() debe completarse antes de usar el almacenamiento.')
}

// ---------------------------------------------------------------------------
// Escritura por lotes
// ---------------------------------------------------------------------------

function flushSoon(): Promise<boolean> {
  if (scheduled) return scheduled
  const run = chain.then(async () => {
    scheduled = null
    const batch = pending
    pending = new Map()
    if (!batch.size) return true
    try {
      await commit([...batch.values()])
      return true
    } catch {
      // Se reintenta con el siguiente guardado (sin pisar lo que sea más reciente).
      for (const [key, op] of batch) if (!pending.has(key)) pending.set(key, op)
      return false
    }
  })
  scheduled = run
  chain = run.then(() => undefined)
  return run
}

function enqueue(ops: Op[]): Promise<boolean> {
  assertReady()
  for (const op of ops) {
    if ('remove' in op) cache.delete(op.key)
    else cache.set(op.key, op.value)
    pending.set(op.key, op)
  }
  if (!pending.size) return Promise.resolve(true)
  return flushSoon()
}

/** Espera a que terminen las escrituras en curso (útil al cerrar y en pruebas). */
export async function whenSaved(): Promise<void> {
  await (scheduled ?? chain)
  await chain
}

/** Copia plana (sin proxies de Vue) apta para IndexedDB. */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export function loadSettings(defaults: Settings): Settings {
  assertReady()
  const stored = cache.get('settings')
  if (!stored || typeof stored !== 'object') return { ...defaults }
  try {
    return normalizeSettings({ ...defaults, ...(stored as Partial<Settings>) })
  } catch {
    return { ...defaults }
  }
}

export function saveSettings(settings: Settings): Promise<boolean> {
  return enqueue([{ key: 'settings', value: plain(settings) }])
}

export function loadMessages(): ChatMessage[] {
  assertReady()
  const ids = cache.get(INDEX_KEY)
  if (!Array.isArray(ids)) return []
  return ids
    .map((id) => cache.get(`${MESSAGE_PREFIX}${id}`) as StoredMessage | undefined)
    .map((item) => (item ? fromStoredMessage(item) : null))
    .filter((message): message is ChatMessage => message !== null)
}

/** Escribe solo los mensajes nuevos o modificados, borra los quitados y actualiza el orden. */
export function saveMessages(messages: ChatMessage[]): Promise<boolean> {
  assertReady()
  const ops: Op[] = []
  const ids = messages.map((message) => message.id)
  const keep = new Set(ids)
  for (const message of messages) {
    const key = `${MESSAGE_PREFIX}${message.id}`
    const stored = toStoredMessage(message)
    const previous = cache.get(key) as StoredMessage | undefined
    if (!previous || !sameStored(previous, stored)) ops.push({ key, value: stored })
  }
  const previousIds = Array.isArray(cache.get(INDEX_KEY)) ? (cache.get(INDEX_KEY) as string[]) : []
  for (const id of previousIds) {
    if (!keep.has(id)) ops.push({ key: `${MESSAGE_PREFIX}${id}`, remove: true })
  }
  const sameOrder = previousIds.length === ids.length && previousIds.every((id, i) => id === ids[i])
  if (!sameOrder) ops.push(ids.length ? { key: INDEX_KEY, value: ids } : { key: INDEX_KEY, remove: true })
  return enqueue(ops)
}

export function loadState(): string {
  assertReady()
  const state = cache.get('state')
  return typeof state === 'string' ? state : ''
}

export function saveState(state: string): Promise<boolean> {
  return enqueue([state.trim() ? { key: 'state', value: state } : { key: 'state', remove: true }])
}

export function loadUsage(): TokenUsage | null {
  assertReady()
  const usage = cache.get('usage')
  return usage && typeof usage === 'object' ? (usage as TokenUsage) : null
}

export function saveUsage(usage: TokenUsage | null): Promise<boolean> {
  return enqueue([usage ? { key: 'usage', value: plain(usage) } : { key: 'usage', remove: true }])
}

export function loadDiceGroups(): DiceGroup[] | null {
  assertReady()
  const groups = normalizeDiceGroups(cache.get('dice'))
  return groups.length ? groups : null
}

export function saveDiceGroups(groups: DiceGroup[]): Promise<boolean> {
  return enqueue([{ key: 'dice', value: plain(groups) }])
}

export function clearDiceGroups(): Promise<boolean> {
  return enqueue([{ key: 'dice', remove: true }])
}

export function loadDraft(): string {
  assertReady()
  const draft = cache.get('draft')
  return typeof draft === 'string' ? draft : ''
}

export function saveDraft(draft: string): Promise<boolean> {
  return enqueue([draft ? { key: 'draft', value: draft } : { key: 'draft', remove: true }])
}

/** Borra la partida (mensajes, memoria, uso, dados y borrador) y conserva los ajustes. */
export function clearGameStorage(): Promise<boolean> {
  assertReady()
  const ops: Op[] = []
  for (const key of cache.keys()) {
    if (key.startsWith(MESSAGE_PREFIX)) ops.push({ key, remove: true })
  }
  for (const key of [INDEX_KEY, 'state', 'usage', 'dice', 'draft']) ops.push({ key, remove: true })
  return enqueue(ops)
}

/** Bytes aproximados que ocupa la app (texto en UTF-16). */
export function storageBytes(): number {
  let total = 0
  for (const [key, value] of cache) {
    if (key === SCHEMA_KEY) continue
    const size = typeof value === 'string' ? value.length : JSON.stringify(value)?.length ?? 0
    total += (key.length + size) * 2
  }
  return total
}

/** Cuota que el navegador concede a este sitio (null si no la informa). */
export async function storageQuota(): Promise<number | null> {
  try {
    const estimate = await navigator.storage?.estimate?.()
    return estimate?.quota ?? null
  } catch {
    return null
  }
}
