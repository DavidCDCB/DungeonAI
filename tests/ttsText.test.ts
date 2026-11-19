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

import { chunkForSpeech } from '../src/lib/ttsText'

describe('chunkForSpeech', () => {
  it('agrupa frases sin superar el máximo', () => {
    const text = 'Primera frase corta. Segunda frase algo más larga que la primera. Tercera.'
    const chunks = chunkForSpeech(text, 40)
    expect(chunks.every((chunk) => chunk.length <= 40)).toBe(true)
    expect(chunks.join(' ')).toBe(text)
  })

  it('parte frases enormes por comas y palabras', () => {
    const long = Array.from({ length: 80 }, (_, i) => `palabra${i}`).join(' ')
    const chunks = chunkForSpeech(long, 100)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((chunk) => chunk.length <= 100)).toBe(true)
    expect(chunks.join(' ')).toBe(long)
  })

  it('devuelve vacío sin texto', () => {
    expect(chunkForSpeech('   ')).toEqual([])
  })
})
