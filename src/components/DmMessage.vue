<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Check, Copy, Dices, Pause, Play, RefreshCw, Volume2 } from '@lucide/vue'
import type { ChatMessage } from '../types'
import { renderMarkdown } from '../lib/markdown'
import { formatNumber, formatRate } from '../lib/format'
import {
  alignWords,
  clearHighlight,
  collectDomWords,
  setHighlight,
  type DomWord,
} from '../lib/speechHighlight'
import { useGame } from '../composables/useGame'
import { useToasts } from '../composables/useToasts'
import AppLogo from './AppLogo.vue'
import ThinkingIndicator from './ThinkingIndicator.vue'

const props = defineProps<{ message: ChatMessage; isLast: boolean; streaming: boolean }>()
const game = useGame()
const { push } = useToasts()

const html = computed(() => (props.message.display ? renderMarkdown(props.message.display) : ''))
const dropcap = computed(
  () => !props.message.diceRequest && /^\p{L}/u.test(props.message.display.trim()),
)
const speaking = computed(() => game.speakingId.value === props.message.id)
const paused = computed(() => speaking.value && game.ttsPaused.value)
const copied = ref(false)
const body = ref<HTMLElement | null>(null)
const stats = computed(() => game.liveStats.value)

// --- Resaltado de la palabra que suena -------------------------------------------------
let shown: DomWord[] = []
let mapping: number[] = []
let mappedFor: readonly string[] | null = null
let wasVisible = true
/** Posición del scroll en la palabra anterior y si el movimiento en curso es nuestro (seguir la lectura). */
let lastScrollTop = -1
let followingUntil = 0

function scrollParent(element: HTMLElement | null): HTMLElement | null {
  for (let node = element; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY
    if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) return node
  }
  return null
}

function prepareHighlight(words: readonly string[]) {
  if (!body.value) return false
  shown = collectDomWords(body.value)
  mapping = alignWords([...words], shown.map((word) => word.text))
  mappedFor = words
  return true
}

function showWord(spokenIndex: number) {
  const words = game.speechWords.value
  if (!words.length) return
  if (mappedFor !== words && !prepareHighlight(words)) return
  // Si la palabra no existe en pantalla (p. ej. un número de lista) se mantiene la anterior.
  let target = -1
  for (let i = Math.min(spokenIndex, mapping.length - 1); i >= 0 && target < 0; i--) target = mapping[i]
  const word = target >= 0 ? shown[target] : null
  if (!word) return
  const range = setHighlight(word)
  if (!range) return
  const box = range.getBoundingClientRect()
  const visible = box.bottom > 72 && box.top < window.innerHeight - 140
  // Si el lector movió la pantalla desde la palabra anterior (y no fue nuestro seguimiento), manda él.
  const scroller = scrollParent(word.node.parentElement)
  const userMoved =
    scroller !== null &&
    lastScrollTop >= 0 &&
    Math.abs(scroller.scrollTop - lastScrollTop) > 2 &&
    Date.now() > followingUntil
  // Sigue la lectura solo si el lector la estaba viendo: no tira de la pantalla si se fue a otro sitio.
  if (!visible && wasVisible && !userMoved) {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    followingUntil = Date.now() + 900 // lo que dure el desplazamiento suave
    word.node.parentElement?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
  }
  wasVisible = visible
  lastScrollTop = scroller ? scroller.scrollTop : -1
}

watch(
  () => [speaking.value, game.speechWordIndex.value, html.value] as const,
  ([isSpeaking, index], [, , previousHtml]) => {
    if (!isSpeaking) {
      mappedFor = null
      wasVisible = true
      lastScrollTop = -1
      return
    }
    // El texto mostrado cambió (p. ej. se regeneró): hay que volver a alinear.
    if (previousHtml !== html.value) mappedFor = null
    showWord(index)
  },
  { flush: 'post' },
)

watch(speaking, (isSpeaking) => {
  if (!isSpeaking) clearHighlight()
})
onBeforeUnmount(() => {
  if (speaking.value) clearHighlight()
})

async function copy() {
  try {
    await navigator.clipboard.writeText(props.message.display)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    push('No se pudo copiar al portapapeles.', { tone: 'error' })
  }
}
</script>

<template>
  <article
    :id="`msg-${message.id}`"
    class="group animate-fade-up scroll-mt-4"
    :aria-busy="streaming"
    aria-label="Mensaje del Dungeon Master"
  >
    <div class="mb-2 flex min-h-8 items-center gap-2">
      <AppLogo :size="20" />
      <span class="font-display text-xs font-semibold tracking-[0.18em] whitespace-nowrap text-gold uppercase">
        Dungeon Master
      </span>
      <span
        v-if="message.diceRequest && isLast && !streaming"
        class="ml-1 hidden items-center gap-1 rounded-full border border-gold-dim/50 bg-gold/10 px-2 py-0.5 text-[11px] whitespace-nowrap text-gold-bright sm:inline-flex"
      >
        <Dices class="h-3 w-3" />
        Tirada pendiente
      </span>
      <span
        v-if="streaming && message.display"
        class="ml-auto flex items-center gap-2 text-[11px] whitespace-nowrap text-faint tabular-nums"
        title="Estimación en vivo"
      >
        <span v-if="stats.reasoningTokens" class="hidden sm:inline">
          razonó ~{{ formatNumber(stats.reasoningTokens) }} ·
        </span>
        <span>~{{ formatNumber(stats.contentTokens) }} tokens</span>
        <span class="rounded-md border border-divider bg-ink-soft px-1.5 py-0.5 font-mono text-gold-bright">
          {{ stats.contentRate ? formatRate(stats.contentRate) : '— tok/s' }}
        </span>
      </span>
      <div
        v-if="!streaming"
        class="ml-auto flex items-center gap-0.5 transition-opacity pointer-fine:opacity-0 pointer-fine:group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100"
        :class="speaking ? 'pointer-fine:opacity-100' : ''"
      >
        <button
          type="button"
          class="icon-btn-sm"
          :class="speaking ? 'text-gold' : ''"
          :aria-label="speaking && !paused ? 'Pausar lectura' : paused ? 'Reanudar lectura' : 'Escuchar mensaje'"
          :title="speaking && !paused ? 'Pausar lectura' : paused ? 'Reanudar lectura' : 'Escuchar'"
          @click="game.toggleSpeech(message)"
        >
          <Pause v-if="speaking && !paused" class="h-4 w-4" />
          <Play v-else-if="paused" class="h-4 w-4" />
          <Volume2 v-else class="h-4 w-4" />
        </button>
        <button type="button" class="icon-btn-sm" aria-label="Copiar texto" title="Copiar" @click="copy">
          <Check v-if="copied" class="h-4 w-4 text-success" />
          <Copy v-else class="h-4 w-4" />
        </button>
        <button
          v-if="isLast"
          type="button"
          class="icon-btn-sm"
          aria-label="Regenerar respuesta"
          title="Regenerar respuesta"
          :disabled="game.loading.value"
          @click="game.regenerate()"
        >
          <RefreshCw class="h-4 w-4" />
        </button>
      </div>
    </div>

    <div
      class="rounded-2xl border bg-surface/75 px-4 py-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.03),0_24px_48px_-36px_rgb(0_0_0/0.9)] transition-colors sm:px-7 sm:py-6"
      :class="[speaking ? 'border-gold-dim/70' : 'border-divider', streaming && !message.display ? 'relative overflow-hidden' : '']"
    >
      <ThinkingIndicator v-if="streaming && !message.display" />
      <template v-else>
        <div
          ref="body"
          class="dm-markdown"
          :class="{ 'has-dropcap': dropcap, 'is-streaming': streaming }"
          v-html="html"
        />
      </template>
    </div>
  </article>
</template>

<style>
.is-streaming > :last-child::after {
  content: "";
  display: inline-block;
  width: 0.45em;
  height: 1em;
  margin-left: 0.2em;
  vertical-align: -0.12em;
  border-radius: 2px;
  background: var(--color-gold);
  animation: caret 1s steps(1) infinite;
}
</style>
