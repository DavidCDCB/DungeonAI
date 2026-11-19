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
