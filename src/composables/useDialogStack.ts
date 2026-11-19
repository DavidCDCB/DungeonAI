import { computed, ref } from 'vue'

/**
 * Pila de diálogos abiertos: Esc cierra solo el de arriba y los atajos de
 * teclado de la app se desactivan mientras haya alguno abierto.
 *
 * Cada diálogo añade una entrada al historial, así el gesto «atrás» de Android
 * (o el botón atrás del navegador) cierra el diálogo en lugar de salir de la app.
 */
interface Entry {
  id: number
  close: () => void
  /** Se cerró por el gesto atrás: su entrada del historial ya no existe. */
  popped: boolean
}

const stack = ref<Entry[]>([])
let nextId = 1
let listening = false
let ignoredPops = 0

function top(): Entry | undefined {
  return stack.value[stack.value.length - 1]
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !stack.value.length) return
  event.preventDefault()
  event.stopPropagation()
  top()?.close()
}

function onPopState() {
  if (ignoredPops > 0) {
    ignoredPops--
    return
  }
  const entry = top()
  if (!entry) return
  entry.popped = true
  entry.close()
  // Si el diálogo no se cerró (p. ej. pide confirmar cambios), recupera su entrada.
  setTimeout(() => {
    if (stack.value.some((item) => item.id === entry.id)) {
      entry.popped = false
      history.pushState({ dungeonDialog: entry.id }, '')
    }
  }, 120)
}

function listen() {
  if (listening || typeof window === 'undefined') return
  window.addEventListener('keydown', onKeydown, true)
  window.addEventListener('popstate', onPopState)
  listening = true
}

function register(close: () => void): number {
  listen()
  const id = nextId++
  stack.value = [...stack.value, { id, close, popped: false }]
  history.pushState({ dungeonDialog: id }, '')
  return id
}

function unregister(id: number) {
  const entry = stack.value.find((item) => item.id === id)
  if (!entry) return
  stack.value = stack.value.filter((item) => item.id !== id)
  // Cerrado desde la interfaz: retira su entrada del historial.
  if (!entry.popped) {
    ignoredPops++
    history.back()
  }
}

const depth = computed(() => stack.value.length)

export function useDialogStack() {
  return { register, unregister, depth }
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Mantiene el foco dentro del contenedor al tabular. */
export function trapFocus(event: KeyboardEvent, container: HTMLElement | null) {
  if (event.key !== 'Tab' || !container) return
  const items = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => element.offsetParent !== null || element === document.activeElement,
  )
  if (!items.length) {
    event.preventDefault()
    return
  }
  const first = items[0]
  const last = items[items.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

/** En pantallas táctiles no se enfoca un campo de texto al abrir (abriría el teclado). */
export function focusFirst(container: HTMLElement | null) {
  if (!container) return
  const coarse = window.matchMedia?.('(pointer: coarse)').matches
  const preferred = container.querySelector<HTMLElement>('[data-autofocus]')
  let target = preferred ?? container.querySelector<HTMLElement>(FOCUSABLE)
  if (coarse && target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) target = null
  ;(target ?? container).focus({ preventScroll: true })
}
