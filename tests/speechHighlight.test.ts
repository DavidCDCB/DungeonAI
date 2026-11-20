import { describe, expect, it } from 'vitest'
import {
  alignWords,
  estimateOffset,
  normalizeWord,
  spokenWords,
  wordIndexAt,
  wordStart,
} from '../src/lib/speechHighlight'
import { chunkForSpeech, cleanForSpeech } from '../src/lib/ttsText'

describe('Resaltado de la lectura', () => {
  it('normaliza palabras ignorando puntuación y mayúsculas', () => {
    expect(normalizeWord('«Taberna,»')).toBe('taberna')
    expect(normalizeWord('¡Cuidado!')).toBe('cuidado')
    expect(normalizeWord('ÁRBOL')).toBe('árbol')
    expect(normalizeWord('—')).toBe('')
    expect(normalizeWord('🍺')).toBe('')
  })

  it('las palabras habladas siguen el orden de los fragmentos', () => {
    expect(spokenWords(['uno dos', 'tres'])).toEqual(['uno', 'dos', 'tres'])
  })

  it('alinea con el texto mostrado saltando lo que no se lee', () => {
    const markdown = '## La taberna\n\n**Durnan** levanta la mirada.\n\n1. Hablar con él\n2. Salir 🍺'
    const spoken = spokenWords(chunkForSpeech(cleanForSpeech(markdown)))
    const shown = ['La', 'taberna', 'Durnan', 'levanta', 'la', 'mirada.', '1.', 'Hablar', 'con', 'él', '2.', 'Salir', '🍺']
    const map = alignWords(spoken, shown)
    expect(spoken).toEqual(['La', 'taberna', 'Durnan', 'levanta', 'la', 'mirada.', 'Hablar', 'con', 'él', 'Salir'])
    expect(map).toEqual([0, 1, 2, 3, 4, 5, 7, 8, 9, 11])
  })

  it('una palabra sin equivalente da -1 y no descoloca las siguientes', () => {
    const map = alignWords(['uno', 'fantasma', 'dos'], ['uno', 'dos'])
    expect(map).toEqual([0, -1, 1])
    expect(alignWords(['—', 'uno'], ['uno'])).toEqual([-1, 0])
  })

  it('palabras repetidas se alinean en orden, no con la primera aparición', () => {
    expect(alignWords(['la', 'casa', 'la', 'luz'], ['la', 'casa', 'la', 'luz'])).toEqual([0, 1, 2, 3])
  })

  it('índice y comienzo de palabra dentro de un fragmento', () => {
    const text = 'La puerta se abre'
    expect(wordIndexAt(text, 0)).toBe(0)
    expect(wordIndexAt(text, 3)).toBe(1) // al inicio de «puerta»
    expect(wordIndexAt(text, 5)).toBe(1) // dentro de «puerta»
    expect(wordIndexAt(text, 13)).toBe(3)
    expect(wordStart(text, 5)).toBe(3)
    expect(wordStart(text, 3)).toBe(3)
    expect(wordStart(text, 999)).toBe(13)
  })

  it('estima la posición según el tiempo y la velocidad', () => {
    const text = 'La puerta se abre con un crujido largo y lento'
    expect(estimateOffset(text, 0, 1)).toBe(0)
    const slow = estimateOffset(text, 1500, 1)
    const fast = estimateOffset(text, 1500, 2)
    expect(fast).toBeGreaterThan(slow)
    expect(text[slow - 1] === ' ' || slow === 0).toBe(true) // siempre al inicio de palabra
    expect(estimateOffset(text, 60000, 1)).toBeLessThan(text.length)
    expect(estimateOffset('', 1000, 1)).toBe(0)
  })
})
