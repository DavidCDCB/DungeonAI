export interface ExtractedState {
  display: string
  state: string
}

export interface SectionInfo {
  title: string
  alias: string[]
  /** Se elimina si el DM la omite en el siguiente [ESTADO] (p. ej. el combate terminó). */
  transient?: boolean
  /** Información solo para el DM: se oculta por defecto en la interfaz. */
  secret?: boolean
}

export const MEMORY_SECTIONS: SectionInfo[] = [
  { title: 'Escena', alias: ['escena'] },
  { title: 'Combate', alias: ['combate'], transient: true },
  { title: 'Hoja de personaje', alias: ['hoja de personaje', 'hoja'] },
  { title: 'Inventario', alias: ['inventario', 'equipo', 'objetos'] },
  { title: 'Dinero', alias: ['dinero', 'monedas', 'oro', 'tesoro'] },
  {
    title: 'Condiciones y efectos',
    alias: ['condiciones y efectos', 'condiciones', 'estados', 'efectos'],
  },
  { title: 'Misiones', alias: ['misiones', 'mision', 'misión', 'objetivos'] },
  {
    title: 'PNJs y notas',
    alias: ['pnjs y notas', 'pnjs', 'pnj', 'personajes', 'notas'],
  },
  { title: 'Trama (solo DM)', alias: ['trama (solo dm)', 'trama'], secret: true },
]

const etiquetas = MEMORY_SECTIONS
  .flatMap((section) => section.alias)
  .sort((a, b) => b.length - a.length)
  .map((alias) => escapeRegex(alias))
  .join('|')

const inicioSeccion = new RegExp(
  `^[ \\t]*(?:[-*#>]+[ \\t]*)?(?:\\*\\*|__)?(${etiquetas})(?:\\*\\*|__)?[ \\t]*:`,
  'im',
)

const bloque = /\[\s*ESTADO\s*]([\s\S]*?)(?:\[\s*\/\s*ESTADO\s*]|$)/i
const etiquetaSuelta = /^[ \t]*\[\s*\/?\s*ESTADO\s*][ \t]*$/gim

export function extractState(texto: string): ExtractedState {
  const match = bloque.exec(texto)
  if (!match) return { display: limpiar(texto), state: '' }
  const state = match[1].trim()
  const sinBloque = texto.slice(0, match.index) + texto.slice(match.index + match[0].length)
  const display = limpiar(sinBloque.replace(etiquetaSuelta, ''))
  return { display, state }
}

/**
 * Une la memoria anterior con la nueva. Las secciones que el modelo repite se
 * actualizan; las que omite se conservan, salvo las transitorias (combate).
 */
export function mergeState(previous: string, incoming: string): string {
  const entrante = incoming.trim()
  if (!entrante) return previous.trim()
  const previas = sections(previous)
  const nuevas = sections(entrante)
  if (!nuevas.size) {
    return previas.size ? previous.trim() : entrante
  }
  const unidas = new Map<string, string>()
  for (const section of MEMORY_SECTIONS) {
    const nueva = nuevas.get(section.title)?.trim()
    const value = section.transient ? nueva : nueva || previas.get(section.title)?.trim()
    if (value) unidas.set(section.title, value)
  }
  return [...unidas.entries()]
    .map(([title, value]) => `${title}: ${value}`)
    .join('\n')
}

export function sections(state: string): Map<string, string> {
  const result = new Map<string, string>()
  if (!state.trim()) return result
  const matches = [...state.matchAll(new RegExp(inicioSeccion.source, 'gim'))]
  matches.forEach((match, index) => {
    const title = titleOf(match[1])
    if (!title) return
    const start = (match.index ?? 0) + match[0].length
    const end = matches[index + 1]?.index ?? state.length
    const body = state
      .slice(start, end)
      .trim()
      .replace(/^\*\*|^__/, '')
      .trim()
    if (body || !result.has(title)) result.set(title, body)
  })
  return result
}

export interface MemoryEntry {
  title: string
  body: string
  secret: boolean
  transient: boolean
}

/** Memoria dividida en secciones para mostrarla en la interfaz. */
export function memoryEntries(state: string): MemoryEntry[] {
  const text = state.trim()
  if (!text) return []
  const found = sections(text)
  if (!found.size) {
    return [{ title: 'Notas', body: text, secret: false, transient: false }]
  }
  const entries: MemoryEntry[] = []
  const firstMatch = new RegExp(inicioSeccion.source, 'im').exec(text)
  const preamble = firstMatch ? text.slice(0, firstMatch.index).trim() : ''
  if (preamble) entries.push({ title: 'Notas', body: preamble, secret: false, transient: false })
  for (const section of MEMORY_SECTIONS) {
    const body = found.get(section.title)
    if (body) {
      entries.push({
        title: section.title,
        body,
        secret: Boolean(section.secret),
        transient: Boolean(section.transient),
      })
    }
  }
  return entries
}

/** Indica si una sección de combate describe un combate activo. */
export function isActiveCombat(body: string): boolean {
  const text = body.trim().toLowerCase()
  return Boolean(text) && !/^(ninguno|ninguna|no|n\/a|sin combate|—|-)\.?$/.test(text)
}

interface MemoryCarrier {
  role: string
  state: string
  memory?: string
}

/**
 * Memoria vigente tras una lista de mensajes: parte de la última instantánea
 * guardada y aplica los [ESTADO] posteriores. Sirve para deshacer turnos.
 */
export function memoryAfter(messages: MemoryCarrier[]): string {
  let start = -1
  let memory = ''
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.role === 'assistant' && typeof message.memory === 'string') {
      start = i
      memory = message.memory
      break
    }
  }
  for (let i = start + 1; i < messages.length; i++) {
    const message = messages[i]
    if (message.role === 'assistant' && message.state) {
      memory = mergeState(memory, message.state)
    }
  }
  return memory
}

function titleOf(label: string): string | undefined {
  const normal = label.trim().toLowerCase()
  return MEMORY_SECTIONS.find((section) => section.alias.includes(normal))?.title
}

function limpiar(texto: string): string {
  return texto.replace(/\n{3,}/g, '\n\n').trim()
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
