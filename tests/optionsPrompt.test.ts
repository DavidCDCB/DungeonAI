import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/types'
import {
  INSTRUCCION_OPCIONES,
  buildOptionsPrompt,
  buildSystemPrompt,
  optionsPromptBase,
  promptBase,
} from '../src/lib/prompt'
import { attachOptions, createMessage } from '../src/lib/messages'
import { parseOptions } from '../src/lib/options'

describe('Segunda llamada: prompt de opciones', () => {
  it('es un prompt aparte del principal y no deja marcadores sin reemplazar', () => {
    const prompt = buildOptionsPrompt(DEFAULT_SETTINGS, 'Inventario: daga')
    expect(prompt).not.toMatch(/\{\{\w+\}\}/)
    expect(prompt).toContain('Arquitecto de Opciones')
    expect(prompt).toContain('Sabrina')
    expect(prompt).not.toContain('Eres **RPG-Bot**')
    expect(optionsPromptBase).not.toBe(promptBase)
  })

  it('incluye el canon y la memoria actualizada, en ese orden', () => {
    const prompt = buildOptionsPrompt(
      { ...DEFAULT_SETTINGS, lore: '## Lugares clave\n- Kaer Morhen' },
      'Inventario: espada de plata',
    )
    expect(prompt).toContain('Kaer Morhen')
    expect(prompt).toContain('MEMORIA GUARDADA DE LA PARTIDA')
    expect(prompt).toContain('espada de plata')
    expect(prompt.indexOf('Kaer Morhen')).toBeLessThan(prompt.indexOf('espada de plata'))
    expect(buildOptionsPrompt(DEFAULT_SETTINGS, '  ')).not.toContain('MEMORIA GUARDADA')
  })

  it('el formato que pide lo entiende la app: 5 opciones', () => {
    const blocks = [...optionsPromptBase.matchAll(/```\n([\s\S]*?)```/g)].map((match) => match[1])
    const block = blocks.find((item) => item.includes('{1.'))!
    const parsed = parseOptions(block.replace(/acción/g, 'Hago algo'))
    expect(parsed.options).toHaveLength(5)
  })

  it('exige un comodín 🃏, primera persona y cubrir los caminos evidentes', () => {
    expect(optionsPromptBase).toContain('🃏')
    expect(optionsPromptBase).toMatch(/primera persona/i)
    expect(optionsPromptBase).toMatch(/vac[ií]o/i)
    expect(optionsPromptBase).toMatch(/consisten/i)
  })

  it('el prompt del DM ya no pide escribir opciones y el cierre lo recuerda', () => {
    const prompt = buildSystemPrompt(DEFAULT_SETTINGS, '')
    expect(prompt).toMatch(/no escribas \[ESTADO\] ni opciones/i)
    expect(promptBase).not.toMatch(/exactamente 5 opciones/i)
    expect(INSTRUCCION_OPCIONES).toMatch(/5 opciones/)
  })

  it('une las opciones generadas a la respuesta sin tocar la narración ni el estado', () => {
    const original = createMessage('assistant', 'La puerta cruje.\n\n[ESTADO]\nEscena: sótano.\n[/ESTADO]')
    expect(original.options).toEqual([])
    const generated = createMessage('assistant', '{1. A}\n{2. B}\n{3. C}\n{4. D}\n{5. E 🃏}')
    const merged = attachOptions(original, generated)!
    expect(merged.id).toBe(original.id)
    expect(merged.options).toHaveLength(5)
    expect(merged.display).toBe('La puerta cruje.')
    expect(merged.state).toContain('Escena: sótano.')
  })

  it('rechaza una respuesta de opciones que pide tirada o no trae opciones', () => {
    const original = createMessage('assistant', 'Algo se mueve.')
    expect(attachOptions(original, createMessage('assistant', '[TIRADA] Lanza 1d20 + 3'))).toBeNull()
    expect(attachOptions(original, createMessage('assistant', 'No sé qué hacer'))).toBeNull()
  })
})
