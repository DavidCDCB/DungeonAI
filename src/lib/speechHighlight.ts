/**
 * Resaltado de palabras durante la lectura (TTS).
 *
 * La voz lee un texto limpio (sin Markdown ni emojis) y la pantalla muestra HTML, así que
 * las palabras habladas se alinean con las del DOM comparándolas en orden. El resaltado usa
 * la CSS Custom Highlight API: no modifica el DOM, por lo que convive con `v-html`.
 */

export const HIGHLIGHT_NAME = 'tts-word'

/** Compara palabras ignorando mayúsculas, acentos de puntuación y símbolos. */
export function normalizeWord(word: string): string {
  return word
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

/** Palabras del texto hablado, en el mismo orden en que se leen los fragmentos. */
export function spokenWords(chunks: string[]): string[] {
  return chunks.flatMap((chunk) => chunk.split(' ').filter(Boolean))
}

/**
 * Para cada palabra hablada devuelve el índice de la palabra equivalente en la pantalla
 * (o -1 si no la tiene: puntuación suelta, números de lista, emojis…).
 * Avanza en orden y tolera hasta `lookahead` palabras de pantalla que no se leen.
 */
export function alignWords(spoken: string[], shown: string[], lookahead = 12): number[] {
  const shownKeys = shown.map(normalizeWord)
  const result: number[] = []
  let cursor = 0
  for (const word of spoken) {
    const key = normalizeWord(word)
    if (!key) {
      result.push(-1)
      continue
    }
    let found = -1
    const limit = Math.min(shownKeys.length, cursor + lookahead + 1)
    for (let i = cursor; i < limit; i++) {
      if (shownKeys[i] === key) {
        found = i
        break
      }
    }
    result.push(found)
    if (found >= 0) cursor = found + 1
  }
  return result
}

/** Índice de la palabra (contando espacios) a la que pertenece el carácter `offset`. */
export function wordIndexAt(text: string, offset: number): number {
  const end = Math.max(0, Math.min(offset, text.length))
  let count = 0
  for (let i = 0; i < end; i++) if (text[i] === ' ') count++
  return count
}

/** Posición (carácter) en la que empieza la palabra que contiene `offset`. */
export function wordStart(text: string, offset: number): number {
  let i = Math.max(0, Math.min(offset, text.length - 1))
  while (i > 0 && text[i - 1] !== ' ') i--
  return i
}

/** Caracteres por segundo a velocidad 1 con una voz en español (algo por debajo de la real). */
const CHARS_PER_SECOND = 14

/**
 * Estima por dónde va la voz cuando el navegador no emite eventos de palabra
 * (ocurre con muchas voces «online»). Es una aproximación basada en el tiempo.
 */
export function estimateOffset(text: string, elapsedMs: number, rate: number): number {
  if (!text) return 0
  const position = (Math.max(0, elapsedMs) / 1000) * CHARS_PER_SECOND * Math.max(0.1, rate)
  return wordStart(text, Math.min(Math.floor(position), text.length - 1))
}

export interface DomWord {
  node: Text
  start: number
  end: number
  text: string
}

/** Palabras visibles bajo `root`, en orden de lectura. */
export function collectDomWords(root: HTMLElement): DomWord[] {
  const words: DomWord[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue ?? ''
    for (const match of text.matchAll(/\S+/gu)) {
      words.push({
        node: node as Text,
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
      })
    }
  }
  return words
}

export function highlightSupported(): boolean {
  return (
    typeof CSS !== 'undefined' &&
    'highlights' in CSS &&
    typeof Highlight !== 'undefined' &&
    typeof Range !== 'undefined'
  )
}

export function setHighlight(word: DomWord | null): Range | null {
  if (!highlightSupported()) return null
  if (!word) {
    CSS.highlights.delete(HIGHLIGHT_NAME)
    return null
  }
  const range = new Range()
  range.setStart(word.node, word.start)
  range.setEnd(word.node, word.end)
  CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(range))
  return range
}

export function clearHighlight() {
  if (highlightSupported()) CSS.highlights.delete(HIGHLIGHT_NAME)
}
