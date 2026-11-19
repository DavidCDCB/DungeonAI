<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import {
  BookOpenText,
  Check,
  Dices,
  Pencil,
  RotateCcw,
  SendHorizontal,
  Square,
  TriangleAlert,
  Volume2,
  X,
} from '@lucide/vue'
import { useGame } from '../composables/useGame'
import { formatTokens } from '../lib/format'
import { parseRollMessage } from '../lib/dice'
import { OOC_COMMANDS } from '../lib/commands'

const {
  settings,
  draft,
  loading,
  send,
  cancelTurn,
  hasMessages,
  diceRequested,
  diceSuggestions,
  rollAndSend,
  openDice,
  errorMessage,
  errorKind,
  retry,
  awaitingReply,
  lastMessage,
  editMessage,
  ttsError,
  usage,
  contextOpen,
  storageFailed,
  exportProgress,
  composerFocusNonce,
  configured,
  openSettings,
} = useGame()

const textarea = ref<HTMLTextAreaElement | null>(null)
const menuOpen = ref(false)
const menuRoot = ref<HTMLElement | null>(null)

const commands = OOC_COMMANDS

const placeholder = computed(() => {
  if (!hasMessages.value) return 'Describe cómo quieres empezar, o pulsa «Comenzar aventura»…'
  if (loading.value) return 'Puedes ir escribiendo tu próxima acción…'
  if (diceRequested.value) return 'Lanza los dados o responde al DM…'
  return `¿Qué hace ${settings.character}?`
})

const canEditLast = computed(
  () =>
    awaitingReply.value &&
    lastMessage.value?.role === 'user' &&
    !parseRollMessage(lastMessage.value.content),
)

const usageText = computed(() => {
  if (!usage.value || usage.value.total <= 0) return ''
  const prefix = usage.value.estimated ? '~' : ''
  const context = `Contexto: ${prefix}${formatTokens(usage.value.total)} tokens`
  return usage.value.reasoning > 0
    ? `${context} · Razonamiento: ${prefix}${formatTokens(usage.value.reasoning)} tokens`
    : context
})

function autosize() {
  const element = textarea.value
  if (!element) return
  element.style.height = 'auto'
  element.style.height = `${Math.min(element.scrollHeight, 200)}px`
}

watch(draft, () => void nextTick(autosize))
onMounted(autosize)

watch(composerFocusNonce, async () => {
  await nextTick()
  const element = textarea.value
  if (!element) return
  element.focus()
  element.setSelectionRange(element.value.length, element.value.length)
  autosize()
})

function submit() {
  const text = draft.value.trim()
  if (!text || loading.value) return
  if (!configured.value) {
    openSettings('connection')
    return
  }
  draft.value = ''
  void send(text)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    submit()
  } else if (event.key === 'Escape') {
    textarea.value?.blur()
  }
}

function runCommand(command: string) {
  menuOpen.value = false
  void send(command)
}

function onMenuFocusOut(event: FocusEvent) {
  const next = event.relatedTarget as Node | null
  if (!next || !menuRoot.value?.contains(next)) menuOpen.value = false
}

function editLast() {
  if (lastMessage.value) editMessage(lastMessage.value.id)
}

defineExpose({ focus: () => textarea.value?.focus() })
</script>

<template>
  <footer class="pb-safe shrink-0 border-t border-divider/80 bg-ink/85 px-3 pt-3 backdrop-blur-md sm:px-6">
    <div class="mx-auto w-full max-w-3xl space-y-2">
      <div
        v-if="errorMessage"
        :role="errorKind === 'error' ? 'alert' : 'status'"
        class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2.5 text-sm"
        :class="
          errorKind === 'error'
            ? 'border-error/40 bg-error/10 text-error'
            : 'border-divider bg-surface-high text-muted'
        "
      >
        <TriangleAlert v-if="errorKind === 'error'" class="h-4 w-4 shrink-0" />
        <span class="min-w-0 flex-1 basis-56">{{ errorMessage }}</span>
        <div class="flex items-center gap-1.5">
          <button v-if="awaitingReply" type="button" class="btn-ghost btn-sm" @click="retry">
            <RotateCcw class="h-3.5 w-3.5" />
            Reintentar
          </button>
          <button v-if="canEditLast" type="button" class="btn-ghost btn-sm" @click="editLast">
            <Pencil class="h-3.5 w-3.5" />
            Editar
          </button>
          <button
            type="button"
            class="icon-btn-sm"
            aria-label="Cerrar aviso"
            @click="errorMessage = ''"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        v-if="ttsError"
        role="status"
        class="flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning"
      >
        <Volume2 class="h-4 w-4 shrink-0" />
        <span class="min-w-0 flex-1">{{ ttsError }}</span>
        <button type="button" class="icon-btn-sm" aria-label="Cerrar aviso" @click="ttsError = ''">
          <X class="h-4 w-4" />
        </button>
      </div>

      <div
        v-if="diceRequested && !loading"
        class="animate-fade-up rounded-2xl border border-gold-dim/50 bg-gradient-to-r from-gold/[0.12] via-gold/[0.05] to-transparent p-3"
      >
        <p class="flex items-center gap-2 text-sm font-medium text-gold-bright">
          <Dices class="h-4 w-4" />
          El Dungeon Master pide una tirada
        </p>
        <div class="mt-2.5 flex flex-wrap gap-2">
          <button
            v-for="suggestion in diceSuggestions"
            :key="suggestion.label"
            type="button"
            class="btn-primary btn-sm"
            @click="rollAndSend(suggestion.requests)"
          >
            <Dices class="h-3.5 w-3.5" />
            Lanzar {{ suggestion.label }}
          </button>
          <button type="button" class="btn-ghost btn-sm" @click="openDice()">
            {{ diceSuggestions.length ? 'Otra tirada…' : 'Elegir dados…' }}
          </button>
          <button type="button" class="btn-ghost btn-sm" @click="send('<lanza por mí>')">
            Que lance el DM
          </button>
        </div>
      </div>

      <div
        class="rounded-2xl border border-divider bg-surface-high/90 shadow-[0_18px_40px_-28px_rgb(0_0_0/0.9)] transition focus-within:border-gold-dim/70"
      >
        <label for="composer" class="sr-only">Tu acción</label>
        <textarea
          id="composer"
          ref="textarea"
          v-model="draft"
          rows="1"
          enterkeyhint="send"
          autocomplete="off"
          :placeholder="placeholder"
          class="block max-h-[200px] min-h-[48px] w-full resize-none bg-transparent px-4 pt-3 pb-1 text-[15px] leading-6 text-parchment outline-none placeholder:text-faint focus-visible:outline-none"
          @keydown="onKeydown"
          @input="autosize"
        />
        <div class="flex items-center gap-1 px-2 pb-2">
          <button
            type="button"
            class="icon-btn-sm h-9 w-9"
            :class="diceRequested && !loading ? 'animate-glow text-gold' : ''"
            :disabled="!hasMessages || loading"
            aria-label="Lanzar dados"
            title="Lanzar dados (D)"
            @click="openDice()"
          >
            <Dices class="h-[18px] w-[18px]" />
          </button>
          <div ref="menuRoot" class="relative" @focusout="onMenuFocusOut">
            <button
              type="button"
              class="icon-btn-sm h-9 w-9"
              :disabled="!hasMessages || loading"
              aria-label="Comandos del DM"
              title="Comandos fuera de personaje"
              aria-haspopup="menu"
              :aria-expanded="menuOpen"
              @click="menuOpen = !menuOpen"
            >
              <BookOpenText class="h-[18px] w-[18px]" />
            </button>
            <Transition
              enter-active-class="transition duration-150 ease-out"
              enter-from-class="translate-y-1 opacity-0"
              leave-active-class="transition duration-100"
              leave-to-class="opacity-0"
            >
              <div
                v-if="menuOpen"
                role="menu"
                class="absolute bottom-11 left-0 z-20 w-60 overflow-hidden rounded-xl border border-divider bg-surface-higher py-1 shadow-2xl"
                @keydown.escape.stop="menuOpen = false"
              >
                <p class="px-3 pt-1.5 pb-1 text-[10px] font-semibold tracking-[0.14em] text-faint uppercase">
                  Pedir al DM
                </p>
                <button
                  v-for="item in commands"
                  :key="item.command"
                  type="button"
                  role="menuitem"
                  class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-parchment hover:bg-white/5 focus:bg-white/5 focus:outline-none"
                  @click="runCommand(item.command)"
                >
                  {{ item.label }}
                  <code class="text-[11px] text-faint">{{ item.command }}</code>
                </button>
              </div>
            </Transition>
          </div>
          <p class="ml-1 hidden min-w-0 truncate text-[11px] text-faint md:block">
            "comillas" para hablar · {llaves} para actuar · &lt;…&gt; fuera de personaje
          </p>
          <div class="ml-auto flex items-center gap-2">
            <button
              v-if="loading"
              type="button"
              class="btn-ghost btn-sm h-9"
              @click="cancelTurn"
            >
              <Square class="h-3 w-3 fill-current" />
              Detener
            </button>
            <button
              v-else
              type="button"
              class="btn-primary h-9 w-9 !rounded-xl !p-0"
              :disabled="!draft.trim()"
              aria-label="Enviar"
              title="Enviar (Enter)"
              @click="submit"
            >
              <SendHorizontal class="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      </div>

      <div class="flex min-h-5 items-center gap-3 px-1 text-[11px] text-faint">
        <button
          v-if="usageText"
          type="button"
          class="truncate hover:text-gold-bright"
          title="Ver desglose de tokens"
          @click="contextOpen = true"
        >
          {{ usageText }}
        </button>
        <span v-if="storageFailed" class="inline-flex items-center gap-1 text-error">
          <TriangleAlert class="h-3 w-3" />
          Sin guardar ·
          <button type="button" class="underline" @click="exportProgress()">Exportar</button>
        </span>
        <span v-else-if="hasMessages" class="hidden items-center gap-1 sm:inline-flex">
          <Check class="h-3 w-3" />
          Guardado en este dispositivo
        </span>
        <span class="ml-auto hidden items-center gap-1 lg:inline-flex">
          <span class="kbd">1</span>–<span class="kbd">5</span> opciones ·
          <span class="kbd">D</span> dados · <span class="kbd">/</span> escribir
        </span>
      </div>
    </div>
  </footer>
</template>
