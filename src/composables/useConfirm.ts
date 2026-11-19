import { ref } from 'vue'

export interface ConfirmRequest {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  /** Acción extra opcional, p. ej. "Exportar y reiniciar". Resuelve con 'secondary'. */
  secondaryLabel?: string
}

export type ConfirmResult = 'confirm' | 'secondary' | 'cancel'

interface PendingConfirm extends ConfirmRequest {
  resolve: (result: ConfirmResult) => void
}

const pending = ref<PendingConfirm | null>(null)

function ask(request: ConfirmRequest): Promise<ConfirmResult> {
  pending.value?.resolve('cancel')
  return new Promise((resolve) => {
    pending.value = { ...request, resolve }
  })
}

function answer(result: ConfirmResult) {
  const current = pending.value
  pending.value = null
  current?.resolve(result)
}

export function useConfirm() {
  return { pending, ask, answer }
}
