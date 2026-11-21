import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/types'
import { buildSystemPrompt, promptBase, statePromptBase } from '../src/lib/prompt'
import { MEMORY_SECTIONS, mergeState, sections } from '../src/lib/gameState'
import { createMessage } from '../src/lib/messages'
import { messageFor, rollDice, suggestDice } from '../src/lib/dice'
import { OOC_COMMANDS } from '../src/lib/commands'

/** Generador que devuelve, en orden, los valores de dado indicados. */
function sequence(sides: number, values: number[]) {
  let index = 0
  return () => (values[index++ % values.length] - 1) / sides
}

function codeBlockWith(marker: string, source = promptBase): string {
  const blocks = [...source.matchAll(/```\n([\s\S]*?)```/g)].map((match) => match[1])
  const block = blocks.find((item) => item.includes(marker))
  if (!block) throw new Error(`No hay bloque de código con ${marker}`)
  return block
}

describe('Contrato entre el prompt del DM y la app', () => {
  it('no deja marcadores sin reemplazar', () => {
    const prompt = buildSystemPrompt(DEFAULT_SETTINGS, 'Dinero: 5 PO')
    expect(prompt).not.toMatch(/\{\{\w+\}\}/)
    expect(prompt).toContain('Sabrina, Humana Maga')
    expect(prompt.trimEnd().endsWith('es inválida.')).toBe(true)
  })

  it('reemplaza el prompt original por el personalizado', () => {
    const prompt = buildSystemPrompt(
      {
        ...DEFAULT_SETTINGS,
        customPrompt: 'Narra como {{personaje}} con humor seco. Mundo: {{mundo}}.',
      },
      'Vida: 7',
    )
    expect(prompt).toContain('Narra como Sabrina con humor seco. Mundo: Faerûn (Reinos Olvidados).')
    expect(prompt).not.toContain('RPG-Bot')
    expect(prompt).toContain('MEMORIA GUARDADA DE LA PARTIDA')
    expect(prompt).toContain('Vida: 7')
    expect(prompt.trimEnd().endsWith('es inválida.')).toBe(true)
  })

  it('usa el prompt original cuando el personalizado está vacío', () => {
    const original = buildSystemPrompt(DEFAULT_SETTINGS, '')
    expect(buildSystemPrompt({ ...DEFAULT_SETTINGS, customPrompt: '   \n' }, '')).toBe(original)
  })

  it('la plantilla de [ESTADO] se guarda con todas sus secciones', () => {
    // La plantilla vive en el prompt del Cronista; la «Trama» la escribe el DM con [TRAMA].
    const template = codeBlockWith('[ESTADO]', statePromptBase)
    const body = template.replace(/\[\/?ESTADO\]/g, '')
    expect([...sections(body).keys()]).toEqual(
      MEMORY_SECTIONS.filter((section) => !section.secret).map((section) => section.title),
    )
    expect(codeBlockWith('[TRAMA]')).toContain('[/TRAMA]')
  })

  it('documenta el formato real del lanzador de dados', () => {
    const documented = codeBlockWith('🎲 Tirada').trim()
    const produced = [
      rollDice(20, 1, 5, sequence(20, [14])).message,
      rollDice(20, 1, 5, sequence(20, [17, 6]), 'advantage').message,
      rollDice(20, 1, 2, sequence(20, [20])).message,
      messageFor([rollDice(20, 1, 4, sequence(20, [12])), rollDice(8, 1, 0, sequence(8, [5]))]),
    ].join('\n')
    expect(documented).toBe(produced)
  })

  it('los ejemplos de petición generan botones de tirada', () => {
    const examples = promptBase
      .split('\n')
      .filter((line) => line.startsWith('> [TIRADA]'))
      .map((line) => suggestDice(line).map((item) => item.label))
    expect(examples).toEqual([['1d20 + 5'], ['1d20 + 4 con ventaja', '1d8']])
    const attributes = /`(\[TIRADA\] Lanza 6 grupos[^`]+)`/.exec(promptBase)?.[1] ?? ''
    expect(suggestDice(attributes).map((item) => item.label)).toEqual(['6 × 4d6 descartando el menor'])
  })

  it('el ejemplo de tirada de un enemigo no se toma como petición', () => {
    const npc = promptBase.split('\n').find((line) => line.startsWith('*(Goblin'))!
    const message = createMessage('assistant', `${npc}\n\n{1. A}\n{2. B}\n{3. C}\n{4. D}\n{5. E 🃏}`)
    expect(message.diceRequest).toBe(false)
    expect(message.options).toHaveLength(5)
  })

  it('menciona todos los comandos del menú de la app', () => {
    for (const { command } of OOC_COMMANDS) expect(promptBase).toContain(`\`${command}\``)
  })
})

describe('Respuestas que siguen el prompt', () => {
  const estado = `[ESTADO]
Escena: Muelles de Aguas Profundas, día 2, medianoche, niebla.
Hoja: Sabrina, humana maga nivel 1, PG 8/8, CA 12.
Inventario: bastón, grimorio, daga.
Dinero: 10 PO.
Condiciones y efectos: ninguna.
Misiones: Encontrar al gato (activa).
PNJs y notas: Durnan, tabernero.
Trama (solo DM): el gato es un familiar robado.
[/ESTADO]`

  it('respuesta con opciones', () => {
    const message = createMessage(
      'assistant',
      `La niebla trae olor a sal y brea.\n\n${estado}\n\n{1. Sigo las huellas mojadas}\n{2. "¿Hay alguien ahí?"}\n{3. Me escondo tras unas cajas}\n{4. Enciendo una luz mágica}\n{5. Imito el maullido de un gato gigante 🃏}`,
    )
    expect(message.diceRequest).toBe(false)
    expect(message.options).toHaveLength(5)
    expect(message.display).toBe('La niebla trae olor a sal y brea.')
    expect(mergeState('', message.state)).toContain('Escena: Muelles de Aguas Profundas')
  })

  it('respuesta con petición de tirada antes de [ESTADO]', () => {
    const message = createMessage(
      'assistant',
      `Una figura se mueve entre la niebla.\n\n[TIRADA] 🎲 *Lanza **1d20 + 3** para una prueba de Percepción.*\n\n${estado}`,
    )
    expect(message.diceRequest).toBe(true)
    expect(message.options).toEqual([])
    expect(message.display).toContain('Lanza **1d20 + 3**')
    expect(message.display).not.toContain('[TIRADA]')
    expect(message.display).not.toContain('Escena:')
    expect(suggestDice(message.display).map((item) => item.label)).toEqual(['1d20 + 3'])
  })
})
