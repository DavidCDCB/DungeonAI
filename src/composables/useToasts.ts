import { ref } from 'vue'

export type ToastTone = 'info' | 'success' | 'warning' | 'error'

export interface ToastAction {
  label: string
  run: () => void
}

export interface Toast {
  id: number
  message: string
  tone: ToastTone
  action?: ToastAction
  /** ms; 0 = hasta que se cierre */
  timeout: number
}

const toasts = ref<Toast[]>([])
let nextId = 1
const timers = new Map<number, ReturnType<typeof setTimeout>>()

function dismiss(id: number) {
  const timer = timers.get(id)
  if (timer) clearTimeout(timer)
  timers.delete(id)
  toasts.value = toasts.value.filter((toast) => toast.id !== id)
}

function push(
  message: string,
  options: { tone?: ToastTone; action?: ToastAction; timeout?: number; key?: string } = {},
): number {
  const id = nextId++
  const tone = options.tone ?? 'info'
  const timeout = options.timeout ?? (options.action ? 7000 : tone === 'error' ? 8000 : 4000)
  // Evita duplicados del mismo mensaje.
  const duplicate = toasts.value.find((toast) => toast.message === message)
  if (duplicate) dismiss(duplicate.id)
  toasts.value = [...toasts.value.slice(-3), { id, message, tone, action: options.action, timeout }]
  if (timeout > 0) timers.set(id, setTimeout(() => dismiss(id), timeout))
  return id
}

export function useToasts() {
  return { toasts, push, dismiss }
}
