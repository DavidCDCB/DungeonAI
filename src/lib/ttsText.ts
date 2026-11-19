/** Prepara el texto para el TTS: quita Markdown y emojis, conserva la prosa. */
export function cleanForSpeech(text: string): string {
  let t = text.trim()
  t = t.replace(/```[a-zA-Z0-9_+-]*/g, '')
  // Quita etiquetas HTML reales; conserva el texto de los comandos <así>.
  t = t.replace(/<\/?(?:br|p|b|i|u|s|em|strong|span|div|small|sup|sub|hr|code|pre)\b[^>\n]{0,80}>/gi, ' ')
  t = t.replace(/<([^<>\n]{1,80})>/g, '$1')
  t = t.replace(/!\[([^\]]*)]\([^)]*\)/g, '$1')
  t = t.replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
  t = t.replace(/^[ \t]{0,3}#{1,6}[ \t]*/gm, '')
  t = t.replace(/^[ \t]*>+[ \t]?/gm, '')
  t = t.replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, '')
  t = t.replace(
    /^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)+\|?[ \t]*$/gm,
    '',
  )
  t = t.replace(/^[ \t]*[-*+][ \t]+/gm, '')
  t = t.replace(/^[ \t]*\d{1,2}[.)][ \t]+/gm, '')
  t = t.replace(/\|/g, ' ')
  t = t.replace(/[*_~`]+/g, '')
  t = t.replace(/[\[\]]/g, ' ')
  t = removeEmojis(t)
  t = t.replace(/\s+/g, ' ').trim()
  t = t.replace(/\s+([,.;:!?])/g, '$1')
  return t.trim()
}

/**
 * Divide el texto en fragmentos cortos por frases. Chrome corta las locuciones
 * largas (~15 s) con algunas voces; hablar por fragmentos lo evita y permite
 * pausar y reanudar con fiabilidad.
 */
export function chunkForSpeech(text: string, max = 220): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  const sentences = clean.split(/(?<=[.!?…;:])\s+/)
  const chunks: string[] = []
  let current = ''
  const push = (piece: string) => {
    if (!piece) return
    if (!current) current = piece
    else if (current.length + 1 + piece.length <= max) current += ` ${piece}`
    else {
      chunks.push(current)
      current = piece
    }
  }
  for (const sentence of sentences) {
    if (sentence.length <= max) {
      push(sentence)
      continue
    }
    for (const part of splitLong(sentence, max)) push(part)
  }
  if (current) chunks.push(current)
  return chunks
}

function splitLong(sentence: string, max: number): string[] {
  const parts: string[] = []
  let current = ''
  for (const clause of sentence.split(/(?<=,)\s+/)) {
    const words = clause.length > max ? clause.split(' ') : [clause]
    for (const word of words) {
      if (!current) current = word
      else if (current.length + 1 + word.length <= max) current += ` ${word}`
      else {
        parts.push(current)
        current = word
      }
    }
  }
  if (current) parts.push(current)
  return parts
}

function removeEmojis(text: string): string {
  let result = ''
  for (const char of text) {
    const cp = char.codePointAt(0) ?? 0
    if (!isEmoji(cp)) result += char
  }
  return result
}

function isEmoji(cp: number): boolean {
  return (
    (cp >= 0x1f000 && cp <= 0x1faff) ||
    (cp >= 0x2600 && cp <= 0x27bf) ||
    (cp >= 0x2190 && cp <= 0x21ff) ||
    (cp >= 0x2300 && cp <= 0x23ff) ||
    (cp >= 0x25a0 && cp <= 0x25ff) ||
    (cp >= 0x2900 && cp <= 0x297f) ||
    (cp >= 0x2b00 && cp <= 0x2bff) ||
    cp === 0x2022 ||
    cp === 0xfe0e ||
    cp === 0xfe0f ||
    cp === 0x200d ||
    cp === 0x20e3 ||
    (cp >= 0xe0020 && cp <= 0xe007f)
  )
}
