<script setup lang="ts">
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from '@lucide/vue'
import { useToasts, type Toast } from '../composables/useToasts'

const { toasts, dismiss } = useToasts()

const icons = { info: Info, success: CheckCircle2, warning: TriangleAlert, error: XCircle }

const tones: Record<Toast['tone'], string> = {
  info: 'border-divider text-parchment',
  success: 'border-success/40 text-parchment',
  warning: 'border-warning/45 text-parchment',
  error: 'border-error/50 text-parchment',
}

const iconTones: Record<Toast['tone'], string> = {
  info: 'text-gold',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
}

function run(toast: Toast) {
  toast.action?.run()
  dismiss(toast.id)
}
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-0 top-16 z-[60] flex flex-col items-center gap-2 px-3 sm:top-auto sm:right-5 sm:bottom-5 sm:left-auto sm:items-end"
    aria-live="polite"
    aria-relevant="additions"
  >
    <TransitionGroup
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-2 opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-for="toast in toasts"
        :key="toast.id"
        :role="toast.tone === 'error' ? 'alert' : 'status'"
        class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border bg-surface-higher/95 px-4 py-3 text-sm shadow-[0_20px_50px_-20px_rgb(0_0_0/0.9)] backdrop-blur"
        :class="tones[toast.tone]"
      >
        <component :is="icons[toast.tone]" class="mt-0.5 h-4 w-4 shrink-0" :class="iconTones[toast.tone]" />
        <p class="min-w-0 flex-1 leading-5">{{ toast.message }}</p>
        <button
          v-if="toast.action"
          type="button"
          class="shrink-0 rounded-lg px-2 py-0.5 text-xs font-semibold text-gold-bright hover:bg-gold/10"
          @click="run(toast)"
        >
          {{ toast.action.label }}
        </button>
        <button
          type="button"
          class="-mr-1 shrink-0 text-faint hover:text-parchment"
          aria-label="Cerrar aviso"
          @click="dismiss(toast.id)"
        >
          <X class="h-4 w-4" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
