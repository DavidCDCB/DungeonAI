<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { X } from '@lucide/vue'
import { focusFirst, trapFocus, useDialogStack } from '../composables/useDialogStack'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    description?: string
    variant?: 'center' | 'drawer'
    size?: 'sm' | 'md' | 'lg'
    dismissible?: boolean
  }>(),
  { variant: 'center', size: 'md', dismissible: true, description: '' },
)

const emit = defineEmits<{ close: [] }>()

const panel = ref<HTMLElement | null>(null)
const titleId = useId()
const descriptionId = useId()
const { register, unregister } = useDialogStack()
let stackId: number | null = null
let restoreFocus: HTMLElement | null = null

const panelClass = computed(() => {
  if (props.variant === 'drawer') {
    const drawerWidth = props.size === 'sm' ? 'max-w-[440px]' : props.size === 'lg' ? 'max-w-[740px]' : 'max-w-[560px]'
    return `drawer-panel h-full w-full ${drawerWidth} border-l border-divider`
  }
  const width = props.size === 'sm' ? 'sm:max-w-md' : props.size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg'
  return `dialog-panel w-full ${width} max-h-[92dvh] rounded-t-3xl border border-divider sm:rounded-2xl`
})

function requestClose() {
  if (props.dismissible) emit('close')
}

function release() {
  if (stackId !== null) {
    unregister(stackId)
    stackId = null
  }
  const target = restoreFocus
  restoreFocus = null
  if (target && document.contains(target)) target.focus({ preventScroll: true })
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      stackId = register(requestClose)
      await nextTick()
      focusFirst(panel.value)
    } else {
      release()
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (stackId !== null) unregister(stackId)
})
</script>

<template>
  <Teleport to="body">
    <Transition :name="variant === 'drawer' ? 'drawer' : 'dialog'" :duration="240">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex"
        :class="variant === 'drawer' ? 'justify-end' : 'items-end justify-center sm:items-center sm:p-4'"
      >
        <div class="dialog-backdrop absolute inset-0 bg-black/65 backdrop-blur-[3px]" @click="requestClose" />
        <section
          ref="panel"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          :aria-describedby="description ? descriptionId : undefined"
          tabindex="-1"
          class="relative flex flex-col bg-surface shadow-[0_30px_80px_-20px_rgb(0_0_0/0.9)] outline-none"
          :class="panelClass"
          @keydown="trapFocus($event, panel)"
        >
          <header class="flex items-start gap-3 border-b border-divider px-5 py-4 sm:px-6">
            <div
              v-if="$slots.icon"
              class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gold-dim/50 bg-gold/10 text-gold"
            >
              <slot name="icon" />
            </div>
            <div class="min-w-0 flex-1">
              <h2 :id="titleId" class="font-display text-lg font-semibold tracking-wide text-gold-bright">
                {{ title }}
              </h2>
              <p v-if="description" :id="descriptionId" class="mt-0.5 text-xs leading-5 text-muted">
                {{ description }}
              </p>
            </div>
            <button
              v-if="dismissible"
              type="button"
              class="icon-btn -mt-1 -mr-2"
              aria-label="Cerrar"
              @click="requestClose"
            >
              <X class="h-5 w-5" />
            </button>
          </header>
          <slot name="toolbar" />
          <div class="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            <slot />
          </div>
          <footer
            v-if="$slots.footer"
            class="pb-safe flex flex-wrap items-center justify-end gap-2 border-t border-divider px-5 pt-3 sm:px-6"
          >
            <slot name="footer" />
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style>
.dialog-enter-active .dialog-backdrop,
.dialog-leave-active .dialog-backdrop,
.drawer-enter-active .dialog-backdrop,
.drawer-leave-active .dialog-backdrop {
  transition: opacity 200ms ease;
}

.dialog-enter-active .dialog-panel,
.dialog-leave-active .dialog-panel {
  transition:
    transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 200ms ease;
}

.drawer-enter-active .drawer-panel,
.drawer-leave-active .drawer-panel {
  transition:
    transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 200ms ease;
}

.dialog-enter-from .dialog-backdrop,
.dialog-leave-to .dialog-backdrop,
.drawer-enter-from .dialog-backdrop,
.drawer-leave-to .dialog-backdrop {
  opacity: 0;
}

.dialog-enter-from .dialog-panel,
.dialog-leave-to .dialog-panel {
  opacity: 0;
  transform: translateY(24px) scale(0.98);
}

.drawer-enter-from .drawer-panel,
.drawer-leave-to .drawer-panel {
  opacity: 0.6;
  transform: translateX(48px);
}
</style>
