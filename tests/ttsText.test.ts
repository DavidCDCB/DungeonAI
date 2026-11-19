import { describe, expect, it } from 'vitest'
import { cleanForSpeech } from '../src/lib/ttsText'

describe('TtsText', () => {
  it('quita Markdown y emojis', () => {
    const text = cleanForSpeech(
      '## Capítulo I\n\n**La puerta** cruje. 🕯️ La [fuente](https://x.com) dice que hay un 😀 peligro.\n\n- Entrar\n- Esperar',
    )
    expect(text).toBe(
      'Capítulo I La puerta cruje. La fuente dice que hay un peligro. Entrar Esperar',
    )
  })

  it('conserva dados, acentos y puntuación', () => {
    const original = 'La tirada es 1d20 + 3 y el daño 2d6 - 1; hace 20° de frío.'
    expect(cleanForSpeech(original)).toBe(original)
  })

  it('un mensaje solo de emojis queda vacío', () => {
    expect(cleanForSpeech('🎲🕯️⭐✅❤️')).toBe('')
  })
})
