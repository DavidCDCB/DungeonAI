<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowDown } from '@lucide/vue'
import { useGame } from '../composables/useGame'
import DmMessage from './DmMessage.vue'
import PlayerMessage from './PlayerMessage.vue'
import OptionList from './OptionList.vue'
import EmptyState from './EmptyState.vue'
import { AGENT_ATTEMPTS } from '../lib/retry'

const PAGE = 60

const {
  displayMessages,
  messages,
  visibleOptions,
  loading,
  optionsPending,
  memoryPending,
  agentAttempt,
  optionsMissing,
  generateOptions,
  settings,
  pendingId,
  scrollTarget,
  scrollNonce,
  streamNonce,
} = useGame()

const container = ref<HTMLElement | null>(null)
const visibleCount = ref(PAGE)
const follow = ref(false)
const showJump = ref(false)

/** La última respuesta lleva opciones: se están generando o aún no empezaron a generarse. */
const optionsComing = computed(() => {
  if (optionsPending.value) return true
  const last = messages.value[messages.value.length - 1]
  return Boolean(
    memoryPending.value &&
      last &&
      last.role === 'assistant' &&
      !last.diceRequest &&
      !last.options.length &&
      last.display.trim(),
  )
})
const pendingLabel = computed(() => {
  const base =
    memoryPending.value && optionsPending.value
      ? 'Actualizando la memoria y preparando tus opciones…'
      : memoryPending.value
        ? 'Actualizando la memoria…'
        : 'Preparando tus opciones…'
  return agentAttempt.value > 1 ? `${base} reintentando (${agentAttempt.value}/${AGENT_ATTEMPTS})` : base
})

const hiddenCount = computed(() => Math.max(0, displayMessages.value.length - visibleCount.value))
const rendered = computed(() => displayMessages.value.slice(hiddenCount.value))
const lastId = computed(() => messages.value[messages.value.length - 1]?.id)

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function offsetOf(element: HTMLElement, scroller: HTMLElement): number {
  return element.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
}

function loadEarlier() {
  const scroller = container.value
  if (!scroller) return
  const previousHeight = scroller.scrollHeight
  const previousTop = scroller.scrollTop
  visibleCount.value += PAGE
  void nextTick(() => {
    scroller.scrollTop = scroller.scrollHeight - previousHeight + previousTop
  })
}

function jumpToBottom() {
  follow.value = loading.value
  container.value?.scrollTo({
    top: container.value.scrollHeight,
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
  })
}

let atBottom = true
let lastHeight = 0
let resizeObserver: ResizeObserver | null = null

function updateJump() {
  const scroller = container.value
  if (!scroller) return
  const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
  showJump.value = distance > 320
  atBottom = distance < 80
}

/**
 * Cuando el área del chat se encoge (se abre el teclado del móvil o aparece el
 * banner de tirada) y el jugador estaba al final, lo mantiene al final.
 */
onMounted(() => {
  const scroller = container.value
  if (!scroller || typeof ResizeObserver === 'undefined') return
  lastHeight = scroller.clientHeight
  resizeObserver = new ResizeObserver(() => {
    const height = scroller.clientHeight
    if (height < lastHeight && atBottom) scroller.scrollTop = scroller.scrollHeight
    lastHeight = height
  })
  resizeObserver.observe(scroller)
})

onBeforeUnmount(() => resizeObserver?.disconnect())

/** El jugador tomó el control del scroll: deja de seguir al DM. */
function stopFollowing() {
  if (loading.value) follow.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (['PageUp', 'ArrowUp', 'Home'].includes(event.key)) stopFollowing()
}

watch(
  () => messages.value.length,
  (length) => {
    if (length === 0) visibleCount.value = PAGE
  },
)

let followedId: string | null = null
watch(pendingId, (id) => {
  if (id) followedId = id
})

/**
 * Al terminar el turno, si el jugador no tomó el control del scroll, muestra
 * las opciones sin perder de vista el inicio de la respuesta.
 */
watch(loading, async (value, previous) => {
  if (value) {
    follow.value = true
    return
  }
  const wasFollowing = follow.value
  follow.value = false
  if (!previous || !wasFollowing || !followedId) return
  await nextTick()
  const scroller = container.value
  const bubble = document.getElementById(`msg-${followedId}`)
  if (!scroller || !bubble) return
  const maxScroll = scroller.scrollHeight - scroller.clientHeight
  const target = Math.min(maxScroll, offsetOf(bubble, scroller) - 16)
  if (target > scroller.scrollTop + 1) {
    scroller.scrollTo({ top: target, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }
})

watch(
  scrollNonce,
  async () => {
    await nextTick()
    const scroller = container.value
    const target = scrollTarget.value
    if (!scroller || !target) return
    const behavior = prefersReducedMotion() ? 'auto' : 'smooth'
    if (target === 'bottom') {
      follow.value = true
      scroller.scrollTo({ top: scroller.scrollHeight, behavior })
      return
    }
    const element = document.getElementById(`msg-${target}`)
    if (!element) return
    scroller.scrollTo({ top: Math.max(0, offsetOf(element, scroller) - 16), behavior })
  },
  { flush: 'post' },
)

/**
 * Mientras el DM escribe, baja con el texto hasta que el inicio de su respuesta
 * llega arriba; desde ahí deja leer sin mover la vista.
 */
watch(
  streamNonce,
  async () => {
    if (!follow.value || !pendingId.value) return
    await nextTick()
    const scroller = container.value
    const bubble = document.getElementById(`msg-${pendingId.value}`)
    if (!scroller || !bubble) return
    const maxScroll = scroller.scrollHeight - scroller.clientHeight
    const target = Math.min(maxScroll, offsetOf(bubble, scroller) - 16)
    if (target > scroller.scrollTop + 1) scroller.scrollTop = target
    updateJump()
  },
  { flush: 'post' },
)

defineExpose({ container })
</script>

<template>
  <div class="relative flex min-h-0 flex-1 flex-col">
    <div
      ref="container"
      class="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      @scroll.passive="updateJump"
      @wheel.passive="stopFollowing"
      @touchmove.passive="stopFollowing"
      @keydown="onKeydown"
    >
      <div class="mx-auto w-full max-w-3xl px-3 pt-4 pb-8 sm:px-6 sm:pt-8 sm:pb-10">
        <EmptyState v-if="!displayMessages.length" />
        <template v-else>
          <div v-if="hiddenCount" class="mb-8 flex justify-center">
            <button type="button" class="chip" @click="loadEarlier">
              Mostrar {{ Math.min(PAGE, hiddenCount) }} mensajes anteriores ({{ hiddenCount }} ocultos)
            </button>
          </div>
          <div class="space-y-6 sm:space-y-7">
            <template v-for="message in rendered" :key="message.id">
              <DmMessage
                v-if="message.role === 'assistant'"
                :message="message"
                :is-last="message.id === lastId"
                :streaming="message.id === pendingId"
              />
              <PlayerMessage v-else :message="message" />
            </template>
            <OptionList v-if="visibleOptions.length" :options="visibleOptions" />
            <section
              v-else-if="optionsComing"
              class="animate-fade-up"
              role="status"
              aria-live="polite"
              :aria-label="pendingLabel"
            >
              <h3 class="mb-3 flex items-baseline gap-x-2">
                <span class="font-display text-xs font-semibold tracking-[0.16em] text-gold uppercase">
                  ¿Qué hace {{ settings.character }}?
                </span>
                <span class="shimmer-text text-xs">{{ pendingLabel }}</span>
              </h3>
              <div class="grid gap-2" aria-hidden="true">
                <div v-for="n in 5" :key="n" class="h-[3.25rem] animate-pulse rounded-xl border border-divider bg-surface/40" :style="{ animationDelay: `${n * 120}ms` }" />
              </div>
            </section>
            <p v-else-if="memoryPending" class="shimmer-text animate-fade-up text-xs" role="status" aria-live="polite">
              {{ pendingLabel }}
            </p>
            <section v-else-if="optionsMissing" class="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-divider px-4 py-3 text-sm text-muted">
              <span>Este turno no tiene opciones.</span>
              <button type="button" class="btn-sm" @click="generateOptions">Generar opciones</button>
            </section>
          </div>
        </template>
      </div>
    </div>

    <Transition
      enter-active-class="transition duration-200"
      enter-from-class="translate-y-2 opacity-0"
      leave-active-class="transition duration-150"
      leave-to-class="opacity-0"
    >
      <button
        v-if="showJump"
        type="button"
        class="absolute bottom-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-gold-dim/60 bg-surface-higher/95 px-3.5 py-2 text-xs pointer-coarse:px-4 pointer-coarse:py-3 text-gold-bright shadow-xl backdrop-blur hover:border-gold"
        @click="jumpToBottom"
      >
        <ArrowDown class="h-3.5 w-3.5" />
        {{ loading ? 'Seguir al DM' : 'Ir al final' }}
      </button>
    </Transition>
  </div>
</template>
