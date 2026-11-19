<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watchEffect } from 'vue'
import { useGame } from './composables/useGame'
import { useConfirm } from './composables/useConfirm'
import { useDialogStack } from './composables/useDialogStack'
import { usePwa } from './composables/usePwa'
import { useToasts } from './composables/useToasts'
import { useWakeLock } from './composables/useWakeLock'
import AppHeader from './components/AppHeader.vue'
import AppDialog from './components/AppDialog.vue'
import ChatLog from './components/ChatLog.vue'
import Composer from './components/Composer.vue'
import SidePanel from './components/SidePanel.vue'
import SettingsDrawer from './components/SettingsDrawer.vue'
import DiceModal from './components/DiceModal.vue'
import ContextModal from './components/ContextModal.vue'
import MemoryDialog from './components/MemoryDialog.vue'
import ConfirmHost from './components/ConfirmHost.vue'
import ToastHost from './components/ToastHost.vue'

const {
  settings,
  announcement,
  panelOpen,
  loading,
  visibleOptions,
  hasMessages,
  init,
  send,
  newGame,
  openDice,
  focusComposer,
  exportProgress,
  speakingId,
} = useGame()

// Pantalla encendida mientras el DM piensa, escribe o lee en voz alta.
useWakeLock(computed(() => loading.value || speakingId.value !== null))

/** Evita perder un turno en curso al recargar o cerrar la pestaña por accidente. */
function onBeforeUnload(event: BeforeUnloadEvent) {
  if (!loading.value) return
  event.preventDefault()
  event.returnValue = ''
}
const { ask } = useConfirm()
const { depth } = useDialogStack()
const { push } = useToasts()
const pwa = usePwa()

watchEffect(() => {
  const root = document.documentElement
  root.dataset.text = settings.textSize
  root.dataset.font = settings.readingFont
})

async function confirmNewGame() {
  const result = await ask({
    title: '¿Empezar una nueva partida?',
    message:
      'Se borrarán la conversación, la memoria de la partida y los contadores de este navegador. Los ajustes se conservan.',
    confirmLabel: 'Borrar y empezar',
    secondaryLabel: 'Exportar y empezar',
    danger: true,
  })
  if (result === 'cancel') return
  if (result === 'secondary') exportProgress()
  newGame()
  push('Nueva partida lista. ¡Que los dados te sean propicios!', { tone: 'success' })
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

function onKeydown(event: KeyboardEvent) {
  if (depth.value > 0 || event.ctrlKey || event.metaKey || event.altKey) return
  if (isTyping(event.target)) return
  if (/^[1-5]$/.test(event.key)) {
    const option = visibleOptions.value[Number(event.key) - 1]
    if (option && !loading.value) {
      event.preventDefault()
      void send(option)
    }
  } else if (event.key === 'd' || event.key === 'D') {
    if (hasMessages.value && !loading.value) {
      event.preventDefault()
      openDice()
    }
  } else if (event.key === '/') {
    event.preventDefault()
    focusComposer()
  }
}

onMounted(() => {
  init()
  pwa.start()
  window.addEventListener('beforeunload', onBeforeUnload)
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('beforeunload', onBeforeUnload)
})
</script>

<template>
  <div class="flex h-dvh flex-col overflow-hidden text-parchment">
    <a
      href="#composer"
      class="sr-only z-50 rounded-lg bg-gold px-3 py-2 text-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
    >
      Ir a escribir tu acción
    </a>

    <AppHeader @new-game="confirmNewGame" />

    <div class="flex min-h-0 flex-1">
      <main class="flex min-w-0 flex-1 flex-col" aria-label="Partida">
        <ChatLog />
        <Composer />
      </main>

      <aside
        class="hidden w-[340px] shrink-0 overflow-y-auto border-l border-divider/80 bg-ink-soft/60 px-5 py-6 xl:block"
        aria-label="Personaje y memoria"
      >
        <SidePanel />
      </aside>
    </div>

    <AppDialog
      :open="panelOpen"
      title="Tu partida"
      description="Personaje, escena, memoria y voz"
      variant="drawer"
      @close="panelOpen = false"
    >
      <SidePanel />
    </AppDialog>

    <SettingsDrawer />
    <DiceModal />
    <ContextModal />
    <MemoryDialog />
    <ConfirmHost />
    <ToastHost />

    <div class="sr-only" aria-live="polite" aria-atomic="true">{{ announcement }}</div>
  </div>
</template>
