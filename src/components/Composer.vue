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
import { useDialogStack } from '../composables/useDialogStack'
import { formatNumber, formatRate, formatTokens } from '../lib/format'
import { parseRollMessage } from '../lib/dice'
import { OOC_COMMANDS } from '../lib/commands'
import type { DiceRequest } from '../types'

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

/** Con una tirada pendiente el compositor desaparece: solo queda el botón de tirada. */
const dicePending = computed(() => diceRequested.value && !loading.value)
/** Respaldo si el DM pidió tirada pero no escribió una notación legible. */
const fallbackRoll: DiceRequest = { sides: 20, count: 1, bonus: 0, mode: 'normal' }
/** Todas las notaciones de la petición se lanzan juntas con un solo botón. */
const diceLaunch = computed<DiceRequest[]>(() => {
  const requests = diceSuggestions.value.flatMap((suggestion) => suggestion.requests)
  return requests.length ? requests : [fallbackRoll]
})
const diceLaunchLabel = computed(() => {
  const labels = diceSuggestions.value.map((suggestion) => suggestion.label)
  return labels.length ? labels.join(' y ') : '1d20'
})

const textarea = ref<HTMLTextAreaElement | null>(null)
const diceButton = ref<HTMLButtonElement | null>(null)
const menuOpen = ref(false)
const menuRoot = ref<HTMLElement | null>(null)
const { depth } = useDialogStack()

const commands = OOC_COMMANDS

const placeholder = computed(() => {
  if (!hasMessages.value) return '¿Cómo quieres empezar?'
  if (loading.value) return 'Tu próxima acción…'
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
  const parts = [context]
  if (usage.value.reasoning > 0) {
    parts.push(`Razonamiento: ${prefix}${formatNumber(usage.value.reasoning)} tokens`)
  }
  if (usage.value.tokensPerSecond) parts.push(formatRate(usage.value.tokensPerSecond))
  return parts.join(' · ')
})

function autosize() {
  const element = textarea.value
  if (!element) return
  // Vacío: una línea. (scrollHeight incluiría el placeholder si se parte en dos.)
  if (!element.value) {
    element.style.height = ''
    return
  }
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

// Al desaparecer el compositor, el foco pasa al único control disponible.
watch(dicePending, async (pending) => {
  if (!pending) return
  await nextTick()
  if (depth.value === 0) diceButton.value?.focus()
})

/**
 * Sin v-model: en Android (Gboard) la palabra en curso está «en composición»
 * y v-model no la registra hasta el siguiente espacio, así que el botón Enviar
 * seguía deshabilitado con una sola palabra escrita.
 */
function onInput(event: Event) {
  draft.value = (event.target as HTMLTextAreaElement).value
  autosize()
}

function submit() {
  const text = (textarea.value?.value ?? draft.value).trim()
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
  <footer
    class="group/composer pb-safe shrink-0 border-t border-divider/80 bg-ink/85 px-2.5 pt-2 backdrop-blur-md sm:px-6 sm:pt-3"
  >
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
        v-if="dicePending"
        class="animate-fade-up rounded-2xl border border-gold-dim/50 bg-gradient-to-r from-gold/[0.12] via-gold/[0.05] to-transparent p-2.5 sm:p-3"
      >
        <p class="flex items-center gap-2 px-0.5 text-[13px] font-medium text-gold-bright sm:text-sm">
          <Dices class="h-4 w-4" />
          El Dungeon Master pide una tirada
        </p>
        <div class="mt-2 grid gap-2 sm:mt-2.5">
          <button
            ref="diceButton"
            type="button"
            class="btn-primary btn-sm w-full justify-center sm:w-auto"
            @click="rollAndSend(diceLaunch)"
          >
            <Dices class="h-3.5 w-3.5" />
            Lanzar {{ diceLaunchLabel }}
          </button>
        </div>
      </div>

      <!--
        Móvil: una sola fila (comandos · texto · enviar), como un chat.
        Desde sm: texto arriba y herramientas debajo.
      -->
      <div
        v-if="!dicePending"
        class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-end gap-x-0.5 rounded-2xl border border-divider bg-surface-high/90 p-1 shadow-[0_18px_40px_-28px_rgb(0_0_0/0.9)] transition [grid-template-areas:'tools_text_send'] focus-within:border-[#4a4152] sm:gap-x-1 sm:p-0 sm:[grid-template-areas:'text_text_text'_'tools_hint_send']"
      >
        <label for="composer" class="sr-only">Tu acción</label>
        <textarea
          id="composer"
          ref="textarea"
          :value="draft"
          rows="1"
          enterkeyhint="send"
          autocomplete="off"
          autocapitalize="sentences"
          :placeholder="placeholder"
          class="block max-h-[160px] min-h-[44px] w-full resize-none bg-transparent px-2 py-2.5 text-base leading-6 text-parchment outline-none [grid-area:text] placeholder:text-faint focus-visible:outline-none short:max-h-[88px] sm:max-h-[200px] sm:min-h-[46px] sm:px-4 sm:pt-3 sm:pb-1 sm:text-[15px]"
          @keydown="onKeydown"
          @input="onInput"
        />
        <div class="flex items-center gap-0.5 [grid-area:tools] sm:gap-1 sm:pb-2 sm:pl-2">
          <div ref="menuRoot" class="relative" @focusout="onMenuFocusOut">
            <button
              type="button"
              class="icon-btn-sm h-9 w-9 pointer-coarse:h-11 pointer-coarse:w-10 sm:pointer-coarse:w-11"
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
                class="absolute bottom-full left-0 z-20 mb-2 w-64 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-divider bg-surface-higher py-1 shadow-2xl"
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
                  class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-parchment hover:bg-white/5 focus:bg-white/5 focus:outline-none pointer-coarse:py-3"
                  @click="runCommand(item.command)"
                >
                  {{ item.label }}
                  <code class="text-[11px] text-faint">{{ item.command }}</code>
                </button>
              </div>
            </Transition>
          </div>
        </div>
        <p
          class="ml-1 hidden min-w-0 self-center truncate pb-2 text-[11px] text-faint [grid-area:hint] md:block"
        >
          "comillas" para hablar · {llaves} para actuar · &lt;…&gt; fuera de personaje
        </p>
        <div class="flex items-center justify-end [grid-area:send] sm:pr-2 sm:pb-2">
          <button
            v-if="loading"
            type="button"
            class="btn-ghost btn-sm h-9 pointer-coarse:h-11 max-sm:w-11 max-sm:!px-0"
            aria-label="Detener"
            @click="cancelTurn"
          >
            <Square class="h-3 w-3 fill-current" />
            <span class="max-sm:sr-only">Detener</span>
          </button>
          <button
            v-else
            type="button"
            class="btn-primary h-9 w-9 !rounded-xl !p-0 pointer-coarse:h-11 pointer-coarse:w-11"
            :disabled="!draft.trim()"
            aria-label="Enviar"
            title="Enviar (Enter)"
            @click="submit"
          >
            <SendHorizontal class="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>

      <div
        v-if="!dicePending"
        class="flex min-h-5 items-center gap-3 px-1 text-[11px] text-faint short:hidden max-sm:group-has-[textarea:focus]/composer:hidden"
      >
        <button
          v-if="usageText"
          type="button"
          class="truncate hover:text-gold-bright pointer-coarse:-my-3 pointer-coarse:py-3"
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
        <span class="ml-auto hidden items-center gap-1 lg:inline-flex">
          <span class="kbd">1</span>–<span class="kbd">5</span> opciones ·
          <span class="kbd">/</span> escribir
        </span>
      </div>
    </div>
  </footer>
</template>
