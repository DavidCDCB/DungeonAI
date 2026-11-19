/** Prepara el texto para el TTS: quita Markdown y emojis, conserva la prosa. */
export function cleanForSpeech(text: string): string {
  let t = text.trim()
  t = t.replace(/```[a-zA-Z0-9_+-]*/g, '')
  t = t.replace(/<[^>\n]{1,80}>/g, '')
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
