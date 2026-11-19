import { describe, expect, it } from 'vitest'
import { createMessage, modelHistoryContent } from '../src/lib/messages'

describe('Messages', () => {
  it('detecta y quita el marcador [TIRADA]', () => {
    const message = createMessage('assistant', '[TIRADA] Lanza 1d20 + 3 para forzar la puerta.')
    expect(message.diceRequest).toBe(true)
    expect(message.display).toBe('Lanza 1d20 + 3 para forzar la puerta.')
    expect(message.options).toHaveLength(0)
  })

  it('no confunde una tirada resuelta con una petición', () => {
    const message = createMessage(
      'assistant',
      'La tirada de 1d20 + 3 fue 17.\n\n{1. Entrar}\n{2. Esperar}\n{3. Huir}',
    )
    expect(message.diceRequest).toBe(false)
    expect(message.options).toHaveLength(3)
  })

  it('el historial del DM solo lleva la narración', () => {
    const message = createMessage(
      'assistant',
      'La puerta cruje.\n\n[ESTADO]\nInventario: daga\n[/ESTADO]\n\n{1. Entrar}\n{2. Esperar}\n{3. Huir}',
    )
    expect(modelHistoryContent(message)).toBe('La puerta cruje.')
  })
})

import { parseMarkdown } from '../src/lib/markdown'
import { cleanForSpeech } from '../src/lib/ttsText'

describe('Sintaxis <OOC> en la narración', () => {
  it('muestra los corchetes angulares como texto', () => {
    const html = parseMarkdown('Usa <corchetes angulares> o escribe <hoja>.')
    expect(html).toContain('&lt;corchetes angulares&gt;')
    expect(html).toContain('&lt;hoja&gt;')
  })

  it('la voz lee el comando y descarta etiquetas HTML', () => {
    expect(cleanForSpeech('Escribe <hoja> para verla.<br>Fin')).toBe('Escribe hoja para verla. Fin')
  })
})

describe('Tiradas resueltas por el DM', () => {
  it('no confunde la tirada de un enemigo con una petición', () => {
    const message = createMessage(
      'assistant',
      'El ogro lanza su garrote: d20 [12] + 6 = 18 contra tu CA 12. ¡Impacta!\n\n{1. Retrocedo}\n{2. Contraataco}\n{3. Huyo}',
    )
    expect(message.diceRequest).toBe(false)
    expect(message.options).toHaveLength(3)
  })

  it('sigue detectando una petición en la misma respuesta', () => {
    const message = createMessage(
      'assistant',
      'El ogro lanza su garrote: d20 [12] + 6 = 18. Ahora lanza 1d20 + 3 para esquivar.',
    )
    expect(message.diceRequest).toBe(true)
  })
})
