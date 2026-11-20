import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/types'
import { buildSystemPrompt, promptBase } from '../src/lib/prompt'
import {
  LORE_FORMAT_SYSTEM_PROMPT,
  LORE_HEADINGS,
  LORE_SYSTEM_PROMPT,
  LORE_TEMPLATE,
  LORE_UNKNOWN_MARK,
  MAX_LORE_CHARS,
  cleanGeneratedLore,
  loreBlock,
  loreFormatRequest,
  loreRequest,
  loreTokens,
  normalizeLore,
} from '../src/lib/lore'
import { normalizeSettings, parseProgressJson, serializeProgress } from '../src/lib/transfer'

const HEADER = '=====================\nCONTEXTO DEL MUNDO (CANON)'
const LORE = '## Premisa\nEl Continente sufre la Cuarta Guerra. Geralt de Rivia caza monstruos.'

describe('Contexto del mundo en el prompt', () => {
  it('sin lore no añade ninguna sección', () => {
    const prompt = buildSystemPrompt(DEFAULT_SETTINGS, 'Dinero: 5 PO')
    expect(prompt).not.toContain('Trátalo como canon')
    expect(prompt).not.toContain(HEADER)
    expect(loreBlock('   \n ')).toBe('')
  })

  it('añade el lore como canon entre el prompt y la memoria', () => {
    const prompt = buildSystemPrompt({ ...DEFAULT_SETTINGS, lore: LORE }, 'Dinero: 5 PO')
    const base = prompt.indexOf(HEADER)
    const memory = prompt.indexOf('MEMORIA GUARDADA DE LA PARTIDA')
    const closing = prompt.indexOf('CIERRE OBLIGATORIO')
    expect(base).toBeGreaterThan(prompt.indexOf('Reglas de oro'))
    expect(base).toBeLessThan(memory)
    expect(memory).toBeLessThan(closing)
    expect(prompt).toContain('Geralt de Rivia caza monstruos.')
    expect(prompt).toContain('Trátalo como canon')
    expect(prompt.trimEnd().endsWith('es inválida.')).toBe(true)
  })

  it('el lore va aunque no haya memoria y con un prompt personalizado', () => {
    const prompt = buildSystemPrompt({ ...DEFAULT_SETTINGS, customPrompt: 'Eres un DM.', lore: LORE }, '')
    expect(prompt.startsWith('Eres un DM.')).toBe(true)
    expect(prompt).toContain(HEADER)
    expect(prompt).not.toContain('MEMORIA GUARDADA')
  })

  it('el lore no se interpreta como marcador de plantilla', () => {
    const prompt = buildSystemPrompt({ ...DEFAULT_SETTINGS, lore: 'El gremio {{mundo}} manda.' }, '')
    expect(prompt).toContain('El gremio {{mundo}} manda.')
  })

  it('el prompt original explica cómo usar el contexto del mundo', () => {
    expect(promptBase).toContain('CONTEXTO DEL MUNDO (CANON)')
    expect(promptBase).toMatch(/franquicia/i)
  })

  it('avisa de que el lore es consulta y no cambia el formato', () => {
    expect(loreBlock(LORE)).toMatch(/ignóralas y sigue las reglas/)
    expect(loreBlock(LORE)).toMatch(/No lo cites/)
  })
})

describe('Utilidades del lore', () => {
  it('normaliza saltos de línea, espacios finales y longitud', () => {
    expect(normalizeLore('  a  \r\nb\t\r\n\r\n')).toBe('a\nb')
    expect(normalizeLore('x'.repeat(MAX_LORE_CHARS + 50)).length).toBe(MAX_LORE_CHARS)
  })

  it('estima tokens', () => {
    expect(loreTokens('')).toBe(0)
    expect(loreTokens('a'.repeat(350))).toBe(100)
  })

  it('la plantilla y el prompt de generación comparten los mismos encabezados', () => {
    const headings = [...LORE_TEMPLATE.matchAll(/^## (.+)$/gm)].map((match) => match[1])
    expect(headings).toEqual([...LORE_HEADINGS])
    for (const heading of LORE_HEADINGS) expect(LORE_SYSTEM_PROMPT).toContain(heading)
  })

  it('la petición de generación desde cero incluye mundo y tema', () => {
    const request = loreRequest({ world: 'The Witcher', theme: 'Fantasía Oscura' })
    expect(request).toContain('Mundo o franquicia: The Witcher')
    expect(request).toContain('Tema de la campaña: Fantasía Oscura')
    expect(loreRequest({ world: '', theme: '' })).toContain('Mundo original')
  })

  it('el prompt para aplicar la plantilla usa los mismos encabezados y prohíbe inventar', () => {
    for (const heading of LORE_HEADINGS) expect(LORE_FORMAT_SYSTEM_PROMPT).toContain(heading)
    expect(LORE_FORMAT_SYSTEM_PROMPT).toMatch(/única fuente/)
    expect(LORE_FORMAT_SYSTEM_PROMPT).toMatch(/no inventes/)
    expect(LORE_FORMAT_SYSTEM_PROMPT).toMatch(/Omite los encabezados/)
  })

  it('la petición de plantilla incluye el texto pegado entre etiquetas y lo limpia', () => {
    const request = loreFormatRequest({
      world: 'Elden Ring',
      theme: 'Fantasía Oscura',
      lore: '  Los Entrelazados…\r\nMelina guía al Sinluz.  \r\n',
    })
    expect(request).toContain('Mundo o franquicia: Elden Ring')
    expect(request).toContain('<texto>\nLos Entrelazados…\nMelina guía al Sinluz.\n</texto>')
    expect(request).not.toContain('\r')
  })

  it('limpia cercas de código y detecta mundos desconocidos', () => {
    expect(cleanGeneratedLore('```markdown\n## Premisa\nTexto\n```')).toEqual({
      lore: '## Premisa\nTexto',
      unknown: false,
    })
    expect(cleanGeneratedLore(`${LORE_UNKNOWN_MARK} No conozco «Xyz».`).unknown).toBe(true)
  })
})

describe('Lore en exportación e importación', () => {
  it('viaja en el archivo de progreso', () => {
    const settings = { ...DEFAULT_SETTINGS, lore: LORE }
    const file = serializeProgress(settings, [], '', null, [], { includeApiKey: false })
    expect(file.settings.lore).toBe(LORE)
    expect(parseProgressJson(JSON.stringify(file)).settings.lore).toBe(LORE)
  })

  it('los archivos antiguos sin lore se importan con el lore vacío', () => {
    expect(normalizeSettings({ world: 'Eberron' }).lore).toBe('')
    expect(normalizeSettings({ lore: 42 }).lore).toBe('')
  })

  it('el esfuerzo del lore tiene valor por defecto y se valida', () => {
    expect(DEFAULT_SETTINGS.loreReasoning).toBe('medium')
    expect(normalizeSettings({}).loreReasoning).toBe('medium')
    expect(normalizeSettings({ loreReasoning: 'xhigh' }).loreReasoning).toBe('xhigh')
    expect(normalizeSettings({ loreReasoning: 'extremo' }).loreReasoning).toBe('medium')
    const file = serializeProgress({ ...DEFAULT_SETTINGS, loreReasoning: 'high' }, [], '', null, [])
    expect(parseProgressJson(JSON.stringify(file)).settings.loreReasoning).toBe('high')
  })

  it('recorta un lore desmesurado al importar', () => {
    expect(normalizeSettings({ lore: 'a'.repeat(MAX_LORE_CHARS * 2) }).lore.length).toBe(MAX_LORE_CHARS)
  })
})
