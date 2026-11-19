import { Marked } from 'marked'
import DOMPurify from 'dompurify'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * El DM usa la sintaxis `<comando>` para lo que está fuera de personaje. Sin
 * esto, el Markdown lo trataría como HTML y DOMPurify lo borraría: el HTML
 * crudo del modelo se muestra como texto.
 */
const markdown = new Marked({
  breaks: true,
  gfm: true,
  renderer: {
    html(token) {
      return escapeHtml(token.text)
    },
  },
})

let hooked = false

function ensureHooks() {
  if (hooked) return
  hooked = true
  // Los enlaces del DM se abren en otra pestaña sin dar acceso a la app.
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
  })
}

/** Markdown → HTML sin sanitizar (solo para pruebas y para renderMarkdown). */
export function parseMarkdown(text: string): string {
  return markdown.parse(text, { async: false }) as string
}

export function renderMarkdown(text: string): string {
  ensureHooks()
  return DOMPurify.sanitize(parseMarkdown(text), {
    FORBID_ATTR: ['style'],
  })
}
