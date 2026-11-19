export interface ExtractedState {
  display: string
  state: string
}

interface Section {
  title: string
  alias: string[]
}

const catalog: Section[] = [
  { title: 'Hoja de personaje', alias: ['hoja de personaje', 'hoja'] },
  { title: 'Inventario', alias: ['inventario', 'equipo', 'objetos'] },
  { title: 'Dinero', alias: ['dinero', 'monedas', 'oro', 'tesoro'] },
  {
    title: 'Condiciones y efectos',
    alias: ['condiciones y efectos', 'condiciones', 'estados', 'efectos'],
  },
  { title: 'Misiones', alias: ['misiones', 'mision', 'objetivos'] },
  {
    title: 'PNJs y notas',
    alias: ['pnjs y notas', 'pnjs', 'pnj', 'personajes', 'notas'],
  },
]

const etiquetas = catalog
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
 * actualizan; las que omite se conservan de la versión anterior.
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
  for (const section of catalog) {
    const value =
      nuevas.get(section.title)?.trim() || previas.get(section.title)?.trim()
    if (value) unidas.set(section.title, value)
  }
  for (const [title, value] of nuevas) {
    if (!unidas.has(title) && value.trim()) unidas.set(title, value.trim())
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

function titleOf(label: string): string | undefined {
  const normal = label.trim().toLowerCase()
  return catalog.find((section) => section.alias.includes(normal))?.title
}

function limpiar(texto: string): string {
  return texto.replace(/\n{3,}/g, '\n\n').trim()
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
