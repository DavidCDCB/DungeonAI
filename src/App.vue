<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  Settings,
  RotateCcw,
  Dices,
  Pencil,
  X,
  Send,
  Loader2,
  Sparkles,
  Volume2,
  Database,
  AlertTriangle,
  Activity,
  ChevronRight,
} from '@lucide/vue'
import { useGame } from './composables/useGame'
import { providerFor, requiresApiKey } from './lib/providers'
import ChatBubble from './components/ChatBubble.vue'
import SettingsDrawer from './components/SettingsDrawer.vue'
import DiceModal from './components/DiceModal.vue'
import ContextModal from './components/ContextModal.vue'

const {
  settings,
  messages,
  gameState,
  usage,
  loading,
  escribiendo,
  draft,
  errorMessage,
  settingsOpen,
  diceOpen,
  contextOpen,
  browserVoices,
  ttsError,
  diceAvailable,
  hasMessages,
  contextTokens,
  reasoningTokens,
  init,
  send,
  startAdventure,
  newGame,
  openDice,
  closeDice,
  toggleWriting,
  generateResponse,
  formatTokens,
  formatNumber,
  setAutoRead,
  scrollTarget,
  scrollNonce,
} = useGame()

const chatScroll = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLTextAreaElement | null>(null)
const newGameOpen = ref(false)

const voiceLabel = computed(() => {
  const voice = browserVoices.value.find(
    (item) => item.voiceURI === settings.browserVoice,
  )
  return voice ? `${voice.name} · ${voice.lang}` : 'Voz automática del navegador'
})

const configured = computed(
  () => !requiresApiKey(settings.baseUrl) || Boolean(settings.apiKey.trim()),
)

const providerLabel = computed(() => providerFor(settings.baseUrl).label)

const memoryPreview = computed(() => {
  const state = gameState.value.trim()
  if (!state) return 'Sin memoria guardada todavía.'
  return state.length > 340 ? `${state.slice(0, 340)}…` : state
})

const contextText = computed(() =>
  usage.value && usage.value.total > 0
    ? `Contexto: ${usage.value.estimated ? '~' : ''}${formatTokens(usage.value.total)} tokens`
    : 'Contexto: —',
)

const reasoningText = computed(() =>
  (usage.value?.reasoning ?? 0) > 0
    ? `Razonamiento: ${formatTokens(usage.value!.reasoning)} tokens`
    : '',
)

onMounted(() => {
  void init()
  window.addEventListener('keydown', onAppKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onAppKeydown)
})

function onAppKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (newGameOpen.value) {
    newGameOpen.value = false
  } else if (contextOpen.value) {
    contextOpen.value = false
  } else if (diceOpen.value) {
    closeDice(true)
  } else if (settingsOpen.value) {
    settingsOpen.value = false
  }
}

watch(
  scrollNonce,
  async () => {
    await nextTick()
    const container = chatScroll.value
    if (!container) return
    const target = scrollTarget.value
    if (!target) return
    if (target === 'bottom') {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
      return
    }
    const element = document.getElementById(`msg-${target}`)
    if (!element) return
    const top =
      element.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop -
      16
    container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  },
  { flush: 'post' },
)

watch(escribiendo, async (value) => {
  if (!value) return
  await nextTick()
  inputRef.value?.focus()
})

function sendDraft() {
  const text = draft.value.trim()
  if (!text) return
  draft.value = ''
  void send(text)
}

function onInputKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    sendDraft()
  }
}

function retry() {
  void generateResponse()
}

function confirmNewGame() {
  newGame()
  newGameOpen.value = false
}

function toggleAutoRead() {
  setAutoRead(!settings.autoRead)
}
</script>

<template>
  <div class="flex h-screen flex-col overflow-hidden bg-ink text-parchment">
    <header class="shrink-0 border-b border-divider bg-ink/95 px-4 py-3 backdrop-blur sm:px-6">
      <div class="mx-auto flex w-full max-w-[1600px] items-center gap-4">
        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gold-dim/50 bg-gold/10">
          <Dices class="h-5 w-5 text-gold" />
        </div>
        <div class="min-w-0 flex-1">
          <h1 class="truncate font-serif text-xl font-bold leading-tight text-gold sm:text-2xl">
            Dungeon AI
          </h1>
          <p class="truncate text-[11px] text-muted">
            Crónicas de {{ settings.character }}
          </p>
        </div>
        <div class="hidden items-center gap-2 rounded-full border border-divider bg-surface px-3 py-1.5 text-[11px] text-muted md:flex">
          <span class="h-1.5 w-1.5 rounded-full bg-gold" />
          {{ settings.model }}
          <span class="text-divider">·</span>
          {{ settings.reasoning }}
        </div>
        <button
          class="icon-button"
          title="Nueva partida"
          :disabled="loading"
          @click="newGameOpen = true"
        >
          <RotateCcw class="h-5 w-5" />
        </button>
        <button class="icon-button" title="Ajustes" @click="settingsOpen = true">
          <Settings class="h-5 w-5" />
        </button>
      </div>
    </header>

    <div class="flex min-h-0 flex-1">
      <main class="flex min-w-0 flex-1 flex-col">
        <div ref="chatScroll" class="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          <div class="mx-auto w-full max-w-4xl">
            <section
              v-if="!messages.length"
              class="flex min-h-[58vh] flex-col items-center justify-center text-center"
            >
              <div class="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-gold-dim/40 bg-gold/5">
                <Sparkles class="h-7 w-7 text-gold" />
              </div>
              <h2 class="font-serif text-3xl text-gold-bright">La aventura te espera</h2>
              <p class="mt-3 max-w-xl text-sm leading-6 text-muted">
                El Dungeon Master narrará la historia de
                <span class="text-parchment">{{ settings.character }}</span>,
                {{ settings.race.toLowerCase() }} {{ settings.characterClass.toLowerCase() }},
                en {{ settings.world }}. Tema: {{ settings.theme }}.
              </p>
              <button class="btn-gold mt-6" @click="startAdventure">
                {{ configured ? 'Comenzar aventura' : 'Configurar proveedor' }}
              </button>
              <p class="mt-4 text-[11px] text-muted">
                {{ configured ? 'El DM pedirá la primera tirada o presentará la escena.' : 'Abre Ajustes para conectar el proveedor del modelo.' }}
              </p>
            </section>

            <div v-else class="space-y-7">
              <ChatBubble
                v-for="(message, index) in messages"
                :key="message.id"
                :message="message"
                :is-last="index === messages.length - 1"
              />
            </div>
          </div>
        </div>

        <footer class="shrink-0 border-t border-divider bg-surface px-4 py-3 sm:px-6">
          <div class="mx-auto w-full max-w-4xl space-y-2">
            <div
              v-if="errorMessage"
              class="flex items-center gap-3 rounded-xl border border-error/40 bg-error/10 px-3 py-2 text-sm text-error"
            >
              <AlertTriangle class="h-4 w-4 shrink-0" />
              <span class="min-w-0 flex-1">{{ errorMessage }}</span>
              <button
                v-if="messages.length"
                class="rounded-lg border border-error/40 px-2 py-1 text-[11px] font-medium hover:bg-error/10"
                @click="retry"
              >
                Reintentar
              </button>
              <button class="text-error/70 hover:text-error" title="Cerrar" @click="errorMessage = ''">
                <X class="h-4 w-4" />
              </button>
            </div>

            <div
              v-if="ttsError"
              class="flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-[11px] text-warning"
            >
              <Volume2 class="h-4 w-4 shrink-0" />
              <span class="min-w-0 flex-1">{{ ttsError }}</span>
              <button class="text-warning/70 hover:text-warning" title="Cerrar" @click="ttsError = ''">
                <X class="h-4 w-4" />
              </button>
            </div>

            <div
              v-if="loading"
              class="flex items-center gap-3 rounded-2xl border border-divider bg-surface-high px-4 py-3"
            >
              <Loader2 class="h-4 w-4 animate-spin text-gold" />
              <span class="text-sm text-muted">El Dungeon Master está razonando…</span>
            </div>

            <div
              v-else-if="escribiendo"
              class="flex items-end gap-2 rounded-2xl border border-divider bg-surface-high p-2"
            >
              <button class="icon-button h-9 w-9" title="Cerrar entrada" @click="toggleWriting">
                <X class="h-4 w-4" />
              </button>
              <textarea
                ref="inputRef"
                v-model="draft"
                rows="1"
                class="max-h-32 min-h-[38px] flex-1 resize-none border-0 bg-transparent px-1 py-2 text-[15px] leading-6 text-parchment outline-none placeholder:text-muted"
                placeholder="Escribe tu acción…"
                @keydown="onInputKeydown"
              />
              <button
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold text-ink transition hover:bg-gold-bright disabled:opacity-40"
                title="Enviar"
                :disabled="!draft.trim()"
                @click="sendDraft"
              >
                <Send class="h-5 w-5" />
              </button>
            </div>

            <div
              v-else-if="hasMessages"
              class="flex items-center gap-2 rounded-2xl border border-divider bg-surface-high px-3 py-2"
            >
              <button
                class="min-w-0 flex-1 text-left"
                title="Ver detalle de tokens"
                @click="contextOpen = true"
              >
                <p class="truncate text-[11px] text-muted">{{ contextText }}</p>
                <p v-if="reasoningText" class="truncate text-[11px] text-muted">{{ reasoningText }}</p>
              </button>
              <button
                v-if="diceAvailable"
                class="flex h-11 w-11 items-center justify-center rounded-xl border border-gold-dim/50 bg-gold/10 text-gold transition hover:bg-gold/20"
                title="Lanzar dados"
                @click="openDice"
              >
                <Dices class="h-5 w-5" />
              </button>
              <button
                class="flex h-11 w-11 items-center justify-center rounded-xl border border-divider text-muted transition hover:border-gold-dim hover:text-gold"
                title="Escribir acción"
                @click="toggleWriting"
              >
                <Pencil class="h-5 w-5" />
              </button>
            </div>
          </div>
        </footer>
      </main>

      <aside class="hidden w-80 shrink-0 overflow-y-auto border-l border-divider bg-surface/30 px-5 py-5 xl:block">
        <div class="space-y-4">
          <section class="card p-4">
            <div class="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-gold">
              <Activity class="h-3.5 w-3.5" />
              Tokens
            </div>
            <p class="mt-3 text-2xl font-semibold text-gold-bright">
              {{ usage ? `${usage.estimated ? '~' : ''}${formatTokens(contextTokens)}` : '—' }}
            </p>
            <p class="text-[11px] text-muted">contexto del último turno</p>
            <div class="mt-3 flex items-center justify-between border-t border-divider pt-3 text-[11px]">
              <span class="text-muted">Razonamiento</span>
              <span class="font-mono text-parchment">
                {{ reasoningTokens ? formatNumber(reasoningTokens) : '—' }}
              </span>
            </div>
            <button
              class="mt-3 flex w-full items-center justify-between text-[11px] text-gold hover:text-gold-bright"
              @click="contextOpen = true"
            >
              Ver desglose
              <ChevronRight class="h-3.5 w-3.5" />
            </button>
          </section>

          <section class="card p-4">
            <div class="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-gold">
              <Sparkles class="h-3.5 w-3.5" />
              Campaña
            </div>
            <div class="mt-3 space-y-2 text-xs">
              <div class="flex justify-between gap-3">
                <span class="text-muted">Personaje</span>
                <span class="text-right text-parchment">{{ settings.character }}</span>
              </div>
              <div class="flex justify-between gap-3">
                <span class="text-muted">Clase / raza</span>
                <span class="text-right text-parchment">{{ settings.characterClass }} / {{ settings.race }}</span>
              </div>
              <div class="flex justify-between gap-3">
                <span class="text-muted">Mundo</span>
                <span class="text-right text-parchment">{{ settings.world }}</span>
              </div>
              <div class="flex justify-between gap-3">
                <span class="text-muted">Tema</span>
                <span class="text-right text-parchment">{{ settings.theme }}</span>
              </div>
              <div class="flex justify-between gap-3">
                <span class="text-muted">Proveedor</span>
                <span class="text-right text-parchment">{{ providerLabel }}</span>
              </div>
            </div>
          </section>

          <section class="card p-4">
            <div class="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-gold">
              <Database class="h-3.5 w-3.5" />
              Memoria
            </div>
            <p class="mt-3 max-h-36 overflow-y-auto whitespace-pre-wrap text-[11px] leading-5 text-muted">
              {{ memoryPreview }}
            </p>
            <button
              class="mt-3 text-[11px] text-gold hover:text-gold-bright"
              @click="settingsOpen = true"
            >
              Editar memoria
            </button>
          </section>

          <section class="card p-4">
            <div class="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-gold">
              <Volume2 class="h-3.5 w-3.5" />
              Voz
            </div>
            <p class="mt-3 text-xs leading-5 text-parchment">{{ voiceLabel }}</p>
            <p class="mt-1 text-[10px] uppercase tracking-wider text-gold-dim">
              Navegador
            </p>
            <label class="mt-3 flex cursor-pointer items-center gap-2 text-[11px] text-muted">
              <input
                :checked="settings.autoRead"
                type="checkbox"
                class="accent-[#d6b36a]"
                @change="toggleAutoRead"
              >
              Leer automáticamente
            </label>
          </section>

          <section class="rounded-2xl border border-dashed border-divider px-4 py-3 text-[10px] leading-5 text-muted">
            Voz del navegador. No requiere servidor ni Python. Usa las voces instaladas en el sistema.
          </section>
        </div>
      </aside>
    </div>

    <SettingsDrawer />
    <DiceModal />
    <ContextModal />

    <div
      v-if="newGameOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      @click.self="newGameOpen = false"
    >
      <div class="card w-full max-w-md p-6">
        <h2 class="font-serif text-2xl text-gold-bright">¿Reiniciar la aventura?</h2>
        <p class="mt-2 text-sm leading-6 text-muted">
          Se borrarán la conversación, la memoria de la partida y los contadores. No se puede deshacer.
        </p>
        <div class="mt-5 flex justify-end gap-3">
          <button class="btn-ghost" @click="newGameOpen = false">Cancelar</button>
          <button class="btn-gold" @click="confirmNewGame">Reiniciar</button>
        </div>
      </div>
    </div>
  </div>
</template>
