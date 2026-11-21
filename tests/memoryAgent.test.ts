import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/types'
import {
  extractPlot,
  hasFullState,
  memoryAfter,
  mergeState,
  parseStateReply,
  sections,
} from '../src/lib/gameState'
import { createMessage, streamingPreview } from '../src/lib/messages'
import { INSTRUCCION_ESTADO, buildStatePrompt, buildSystemPrompt, statePromptBase } from '../src/lib/prompt'

const MEMORIA = [
  'Escena: Taberna, día 1, noche.',
  'Combate: ronda 2, goblin herido (3/7 PG).',
  'Inventario: bastón, daga',
  'Dinero: 10 PO',
  'Trama (solo DM): el gato es un familiar robado',
].join('\n')

describe('Fusión parcial de la memoria (Cronista de estado)', () => {
  it('conserva el combate y las secciones que no cambiaron', () => {
    const merged = mergeState(MEMORIA, 'Dinero: 15 PO', { partial: true })
    expect(merged).toContain('Dinero: 15 PO')
    expect(merged).toContain('Combate: ronda 2')
    expect(merged).toContain('Inventario: bastón, daga')
  })

  it('el modo completo sigue borrando el combate omitido (compatibilidad)', () => {
    expect(mergeState(MEMORIA, 'Dinero: 15 PO')).not.toContain('Combate')
  })

  it('«Combate: ninguno» cierra el combate y uno activo lo reemplaza', () => {
    expect(mergeState(MEMORIA, 'Combate: ninguno', { partial: true })).not.toContain('Combate')
    expect(mergeState(MEMORIA, 'Combate: ronda 3, goblin muerto', { partial: true })).toContain('ronda 3')
  })

  it('reemplaza la sección completa, no la fusiona', () => {
    const merged = mergeState(MEMORIA, 'Inventario: bastón, daga, llave de hierro', { partial: true })
    expect(sections(merged).get('Inventario')).toBe('bastón, daga, llave de hierro')
  })

  it('ignora la «Trama» que escriba el Cronista cuando se protege', () => {
    const merged = mergeState(MEMORIA, 'Trama (solo DM): inventada\nDinero: 1 PO', { partial: true, protectSecret: true })
    expect(merged).toContain('el gato es un familiar robado')
    expect(merged).not.toContain('inventada')
    expect(merged).toContain('Dinero: 1 PO')
  })

  it('una respuesta vacía no cambia nada', () => {
    expect(mergeState(MEMORIA, parseStateReply('[ESTADO]\n[/ESTADO]') ?? '', { partial: true })).toBe(MEMORIA)
  })

  it('crea la memoria desde cero con la primera respuesta', () => {
    const merged = mergeState('', 'Escena: Taberna.\nHoja de personaje: Sabrina, maga 1', { partial: true })
    expect(sections(merged).size).toBe(2)
  })
})

describe('Lectura de la respuesta del Cronista', () => {
  it('lee el bloque aunque lleve texto alrededor', () => {
    expect(parseStateReply('Claro:\n[ESTADO]\nDinero: 5 PO\n[/ESTADO]\nListo.')).toBe('Dinero: 5 PO')
  })

  it('acepta secciones sueltas si faltan las etiquetas', () => {
    expect(parseStateReply('Dinero: 5 PO\nInventario: daga')).toContain('Inventario: daga')
  })

  it('un bloque vacío significa «sin cambios»; texto sin bloque ni secciones no es válido', () => {
    expect(parseStateReply('[ESTADO]\n[/ESTADO]')).toBe('')
    expect(parseStateReply('No hubo cambios.')).toBeNull() // la app repite la llamada
    expect(parseStateReply('')).toBeNull()
  })
})

describe('Cuaderno secreto [TRAMA] del DM', () => {
  const narracion = 'Un goblin salta desde la sombra.'

  it('se separa de la narración y se guarda como sección secreta', () => {
    const message = createMessage('assistant', `${narracion}\n\n[TRAMA]\nel goblin sirve a Myrkul; el mapa está en el sótano\n[/TRAMA]`)
    expect(message.display).toBe(narracion)
    expect(message.state).toBe('Trama (solo DM): el goblin sirve a Myrkul; el mapa está en el sótano')
    expect(message.options).toEqual([])
    expect(message.diceRequest).toBe(false)
  })

  it('convive con una petición de tirada', () => {
    const message = createMessage(
      'assistant',
      `${narracion}\n\n[TIRADA] 🎲 *Lanza **1d20 + 3** para esquivar.*\n\n[TRAMA]\nsecreto\n[/TRAMA]`,
    )
    expect(message.diceRequest).toBe(true)
    expect(message.display).toContain('Lanza **1d20 + 3**')
    expect(message.display).not.toContain('TRAMA')
    expect(message.state).toContain('secreto')
  })

  it('sin bloque no hay estado', () => {
    const message = createMessage('assistant', narracion)
    expect(message.state).toBe('')
    expect(extractPlot(narracion)).toEqual({ display: narracion, plot: '' })
  })

  it('se oculta mientras el DM escribe', () => {
    expect(streamingPreview(`${narracion}\n\n[TRAMA]\nsecr`)).toBe(narracion)
    expect(streamingPreview(`${narracion}\n\n[TRA`)).toBe(narracion)
  })

  it('un estado con solo «Trama» no es un [ESTADO] completo', () => {
    expect(hasFullState('Trama (solo DM): algo')).toBe(false)
    expect(hasFullState('Trama (solo DM): algo\nDinero: 5 PO')).toBe(true)
    expect(hasFullState('')).toBe(false)
  })

  it('al deshacer turnos, la «Trama» sola no borra el combate', () => {
    const messages = [
      { role: 'assistant', state: '', memory: MEMORIA },
      { role: 'assistant', state: 'Trama (solo DM): nueva pista' },
    ]
    const memory = memoryAfter(messages)
    expect(memory).toContain('nueva pista')
    expect(memory).toContain('Combate: ronda 2')
  })
})

describe('Prompt del Cronista', () => {
  it('es un prompt aparte con el canon y la memoria anterior', () => {
    const prompt = buildStatePrompt({ ...DEFAULT_SETTINGS, lore: '## Lugares clave\n- Kaer Morhen' }, 'Dinero: 5 PO')
    expect(prompt).toContain('Cronista de estado')
    expect(prompt).not.toMatch(/\{\{\w+\}\}/)
    expect(prompt).toContain('Kaer Morhen')
    expect(prompt).toContain('MEMORIA ANTERIOR A ESTE TURNO')
    expect(prompt).toContain('Dinero: 5 PO')
    expect(buildStatePrompt(DEFAULT_SETTINGS, '')).toContain('inicio de la campaña')
    // Con solo la «Trama» del DM sigue siendo el inicio, y la trama se conserva a la vista.
    const onlyPlot = buildStatePrompt(DEFAULT_SETTINGS, 'Trama (solo DM): un culto')
    expect(onlyPlot).toContain('inicio de la campaña')
    expect(onlyPlot).toContain('un culto')
    expect(buildStatePrompt(DEFAULT_SETTINGS, 'Dinero: 5 PO')).not.toContain('inicio de la campaña')
    expect(statePromptBase).toMatch(/Combate: ninguno/)
    expect(INSTRUCCION_ESTADO).toMatch(/\[ESTADO\]/)
  })

  it('el DM sabe que no escribe el estado y que anota la trama con [TRAMA]', () => {
    const prompt = buildSystemPrompt(DEFAULT_SETTINGS, 'Dinero: 5 PO')
    expect(prompt).toMatch(/no la escribas ni la repitas/i)
    expect(prompt).toContain('[TRAMA]')
    expect(prompt).not.toMatch(/dentro del bloque \[ESTADO\]/i)
  })
})
