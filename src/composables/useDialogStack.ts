import { computed, ref } from 'vue'

/**
 * Pila de diálogos abiertos: Esc cierra solo el de arriba y los atajos de
 * teclado de la app se desactivan mientras haya alguno abierto.
 */
interface Entry {
  id: number
  close: () => void
}

const stack = ref<Entry[]>([])
let nextId = 1
let listening = false

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !stack.value.length) return
  event.preventDefault()
  event.stopPropagation()
  stack.value[stack.value.length - 1].close()
}

function register(close: () => void): number {
  if (!listening && typeof window !== 'undefined') {
    window.addEventListener('keydown', onKeydown, true)
    listening = true
  }
  const id = nextId++
  stack.value = [...stack.value, { id, close }]
  return id
}

function unregister(id: number) {
  stack.value = stack.value.filter((entry) => entry.id !== id)
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

export function focusFirst(container: HTMLElement | null) {
  if (!container) return
  const preferred = container.querySelector<HTMLElement>('[data-autofocus]')
  const target = preferred ?? container.querySelector<HTMLElement>(FOCUSABLE)
  ;(target ?? container).focus({ preventScroll: true })
}
