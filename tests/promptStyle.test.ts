import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/types'
import { LORE_FORMAT_SYSTEM_PROMPT, LORE_SYSTEM_PROMPT } from '../src/lib/lore'
import { buildSystemPrompt, optionsPromptBase, promptBase, statePromptBase } from '../src/lib/prompt'

/** Cada prompt que genera texto en español lleva sus reglas de claridad, adaptadas a su tarea. */
describe('Claridad del español en los prompts', () => {
  it('el DM cuida la comprensión, la coherencia y la voz', () => {
    expect(promptBase).toContain('**Claridad del español.**')
    expect(promptBase).toMatch(/entenderse a la primera/)
    expect(promptBase).toMatch(/Referencias claras/)
    expect(promptBase).toMatch(/Coherencia de nombres/)
    expect(promptBase).toMatch(/Pensada para la voz/)
    expect(promptBase).toMatch(/puntos de golpe/)
    expect(promptBase).toMatch(/Nada a medias/)
  })

  it('el DM verifica la claridad antes de enviar', () => {
    expect(promptBase).toMatch(/¿Se entiende cada frase a la primera/)
  })

  it('las opciones son oraciones completas que se entienden solas', () => {
    expect(optionsPromptBase).toContain('## 5. Claridad del español')
    expect(optionsPromptBase).toMatch(/Oración completa y correcta/)
    expect(optionsPromptBase).toMatch(/Sin referentes ambiguos/)
    expect(optionsPromptBase).toMatch(/Se entiende sola/)
    expect(optionsPromptBase).toMatch(/no justifica cortar el sentido/)
  })

  it('las secciones del prompt de opciones siguen numeradas en orden', () => {
    const headings = [...optionsPromptBase.matchAll(/^## (\d+)\./gm)].map((match) => Number(match[1]))
    expect(headings).toEqual(headings.map((_, index) => index + 1))
  })

  it('el Cronista escribe datos que se entienden aislados y sin perder sentido', () => {
    expect(statePromptBase).toContain('## 4. Claridad de lo que anotas')
    expect(statePromptBase).toMatch(/Sin referencias relativas/)
    expect(statePromptBase).toMatch(/autoexplicativos/)
    expect(statePromptBase).toMatch(/Misma grafía que la narración/)
    expect(statePromptBase).toMatch(/no resumas hasta perder significado/)
    const headings = [...statePromptBase.matchAll(/^## (\d+)\./gm)].map((match) => Number(match[1]))
    expect(headings).toEqual(headings.map((_, index) => index + 1))
  })

  it('los dossiers de lore se redactan en español claro y fiel al texto', () => {
    expect(LORE_SYSTEM_PROMPT).toMatch(/español claro, correcto y coherente/)
    expect(LORE_FORMAT_SYSTEM_PROMPT).toMatch(/sin resumir hasta cambiar el significado/)
    expect(LORE_FORMAT_SYSTEM_PROMPT).toMatch(/Al traducir, conserva el sentido exacto/)
  })

  it('el recordatorio de cierre del DM repite la regla al final del prompt', () => {
    const prompt = buildSystemPrompt(DEFAULT_SETTINGS, '')
    expect(prompt).toMatch(/Español claro y correcto/)
    expect(prompt.trimEnd().endsWith('es inválida.')).toBe(true)
  })

  it('los prompts no mezclan voseo ni vosotros y piden español neutro', () => {
    for (const prompt of [promptBase, optionsPromptBase, statePromptBase]) {
      expect(prompt).not.toMatch(/\b(?:vosotros|tenés|querés|vos sos)\b/i)
    }
    expect(promptBase).toMatch(/español neutro/i)
    expect(optionsPromptBase).toMatch(/español neutro/i)
    expect(statePromptBase).toMatch(/español neutro/i)
  })
})
