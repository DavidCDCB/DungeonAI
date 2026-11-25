import { normalizeBaseUrl } from './providers'

export interface ModelHistoryEntry {
  model: string
  baseUrl: string
  lastUsed: number
}

export const MODEL_HISTORY_LIMIT = 24

function sameModel(entry: ModelHistoryEntry, model: string, baseUrl: string): boolean {
  return (
    entry.model.toLowerCase() === model.toLowerCase() &&
    normalizeBaseUrl(entry.baseUrl) === normalizeBaseUrl(baseUrl)
  )
}

/**
 * Mueve el modelo al principio del historial (o lo añade), conservando el más reciente.
 * Los modelos se agrupan por URL base para no sugerir un modelo de otro proveedor.
 */
export function rememberModel(
  history: readonly ModelHistoryEntry[],
  model: string,
  baseUrl: string,
  now = Date.now(),
): ModelHistoryEntry[] {
  const name = model.trim()
  const base = normalizeBaseUrl(baseUrl)
  if (!name || !base) return history as ModelHistoryEntry[]

  const index = history.findIndex((entry) => sameModel(entry, name, base))
  if (index === 0 && history[0].model === name) return history as ModelHistoryEntry[]

  const next = [...history]
  if (index !== -1) next.splice(index, 1)
  next.unshift({ model: name, baseUrl: base, lastUsed: now })
  return next
    .sort((a, b) => b.lastUsed - a.lastUsed)
    .slice(0, MODEL_HISTORY_LIMIT)
}

/** Modelos recientes del proveedor actual; con `query`, solo los que empiezan por ese texto. */
export function suggestModels(
  history: readonly ModelHistoryEntry[],
  baseUrl: string,
  query = '',
  limit = 8,
): ModelHistoryEntry[] {
  const base = normalizeBaseUrl(baseUrl)
  if (!base) return []
  const prefix = query.trim().toLowerCase()
  return history
    .filter((entry) => normalizeBaseUrl(entry.baseUrl) === base)
    .filter((entry) => !prefix || entry.model.toLowerCase().startsWith(prefix))
    .sort((a, b) => b.lastUsed - a.lastUsed)
    .slice(0, Math.max(0, limit))
}

/** Valida y normaliza lo que venga de IndexedDB (datos antiguos o corruptos incluidos). */
export function normalizeModelHistory(value: unknown): ModelHistoryEntry[] {
  if (!Array.isArray(value)) return []
  const entries: ModelHistoryEntry[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const raw = item as Record<string, unknown>
    const model = typeof raw.model === 'string' ? raw.model.trim() : ''
    const baseUrl = typeof raw.baseUrl === 'string' ? normalizeBaseUrl(raw.baseUrl) : ''
    const lastUsed = Number(raw.lastUsed)
    if (!model || !baseUrl || !Number.isFinite(lastUsed)) continue
    entries.push({ model, baseUrl, lastUsed })
  }

  entries.sort((a, b) => b.lastUsed - a.lastUsed)
  const seen = new Set<string>()
  return entries
    .filter((entry) => {
      const key = `${entry.baseUrl}\n${entry.model.toLowerCase()}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, MODEL_HISTORY_LIMIT)
}
