export interface ParsedOptions {
  display: string
  options: string[]
}

const brace = /\{\s*(\d{1,2})\s*[.)\-:]?\s*([^{}]+?)\s*\}/g
const numberedLine = /^\s*\{?\s*(\d{1,2})\s*[.)\-:]\s*(.+?)\s*\}?\s*$/
const braceOnlyLine = /^\s*\{\s*(\d{1,2})\s*[.)\-:]?\s*(.+?)\s*\}\s*$/
const trailingHeading = /^\s*\*{0,2}(acciones|opciones|sugerencias)[^\n]*\*{0,2}\s*$/gim

export function parseOptions(text: string): ParsedOptions {
  if (!text.trim()) return { display: text, options: [] }

  const bloques = [...text.matchAll(brace)]
  if (bloques.length >= 3) {
    const seleccionados = bloques.slice(-5)
    const opciones = seleccionados
      .map((match) => plain(match[2]))
      .filter(Boolean)
    if (opciones.length >= 3) {
      const display = text.slice(0, seleccionados[0].index ?? 0)
      return {
        display: limpiarDisplay(display) || text,
        options: opciones,
      }
    }
  }

  const lineas = text.split(/\r?\n/)
  let indice = lineas.length - 1
  while (indice >= 0 && !lineas[indice].trim()) indice--
  const seleccionadas: Array<{ indice: number; texto: string }> = []
  let saltos = 0
  while (indice >= 0 && seleccionadas.length < 5 && saltos < 2) {
    const linea = lineas[indice]
    if (!linea.trim()) {
      saltos++
      indice--
      continue
    }
    const match = braceOnlyLine.exec(linea) ?? numberedLine.exec(linea)
    if (!match) break
    const opcion = plain(match[2])
    if (opcion) seleccionadas.unshift({ indice, texto: opcion })
    indice--
    saltos = 0
  }
  if (seleccionadas.length) {
    const display = lineas.slice(0, seleccionadas[0].indice).join('\n')
    return {
      display: limpiarDisplay(display) || text,
      options: seleccionadas.map((item) => item.texto),
    }
  }

  return { display: text, options: [] }
}

/** Texto sin marcas de Markdown, para botones y para el TTS. */
export function plain(texto: string): string {
  let t = texto.trim().replace(/^\{|\}$/g, '').trim()
  t = t.replace(/\*\*|__|\*|_|`/g, '')
  t = t.replace(/^\d{1,2}\s*[.)\-:]\s*/, '')
  t = t.replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
  t = t.replace(/\s+/g, ' ').trim()
  return t
}

function limpiarDisplay(texto: string): string {
  return texto
    .replace(trailingHeading, '')
    .trimEnd()
    .replace(/[-* ]+$/g, '')
    .trimEnd()
}
