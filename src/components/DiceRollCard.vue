<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Dices } from '@lucide/vue'
import type { ParsedRoll } from '../lib/dice'

const props = withDefaults(defineProps<{ roll: ParsedRoll; animate?: boolean; delay?: number }>(), {
  animate: false,
  delay: 0,
})

const revealed = ref(!props.animate)
const spinning = ref<number[]>(props.roll.values.map(() => 1))
let timer: ReturnType<typeof setInterval> | null = null
let stop: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  if (!props.animate) return
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (reduced) {
    revealed.value = true
    return
  }
  const sides = props.roll.sides ?? 20
  timer = setInterval(() => {
    spinning.value = props.roll.values.map(() => Math.floor(Math.random() * sides) + 1)
  }, 60)
  stop = setTimeout(() => {
    if (timer) clearInterval(timer)
    revealed.value = true
  }, 700 + props.delay)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  if (stop) clearTimeout(stop)
})

const shown = computed(() => (revealed.value ? props.roll.values : spinning.value))

/** Índice del dado descartado (el primero con el valor más bajo) o del que no cuenta en ventaja. */
const ignoredIndex = computed(() => {
  const roll = props.roll
  if (roll.dropped !== null) return roll.values.indexOf(roll.dropped)
  if (roll.kept !== null && roll.values.length === 2) {
    const keptIndex = roll.values.indexOf(roll.kept)
    return keptIndex === 0 ? 1 : 0
  }
  return -1
})

const tone = computed(() => {
  if (!revealed.value) return 'border-divider'
  if (props.roll.natural === 20) return 'border-gold shadow-[0_0_30px_-8px_rgb(214_179_106/0.7)]'
  if (props.roll.natural === 1) return 'border-error/60 shadow-[0_0_30px_-10px_rgb(239_138_128/0.6)]'
  return 'border-divider'
})
</script>

<template>
  <div
    class="flex items-center gap-3 rounded-2xl border bg-surface-high/80 px-4 py-3 transition-shadow duration-500"
    :class="tone"
  >
    <div
      class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gold-dim/40 bg-gold/10 text-gold"
      :class="!revealed ? 'animate-tumble' : ''"
    >
      <Dices class="h-5 w-5" />
    </div>
    <div class="min-w-0 flex-1">
      <p class="truncate text-sm font-medium text-parchment">{{ roll.label }}</p>
      <div class="mt-1.5 flex flex-wrap gap-1">
        <span
          v-for="(value, index) in shown"
          :key="index"
          class="inline-flex h-6 min-w-6 items-center justify-center rounded-md border px-1 font-mono text-xs tabular-nums"
          :class="
            revealed && index === ignoredIndex
              ? 'border-divider text-faint line-through'
              : 'border-gold-dim/50 bg-ink-soft text-gold-bright'
          "
        >
          {{ value }}
        </span>
      </div>
    </div>
    <div class="text-right" aria-live="polite">
      <p
        class="font-display text-3xl leading-none font-bold tabular-nums"
        :class="revealed ? 'text-gold-bright' : 'text-faint'"
      >
        {{ revealed ? roll.total : '…' }}
      </p>
      <p v-if="revealed && roll.natural === 20" class="mt-1 text-[11px] font-semibold text-gold">¡Crítico!</p>
      <p v-else-if="revealed && roll.natural === 1" class="mt-1 text-[11px] font-semibold text-error">¡Pifia!</p>
      <p v-else class="mt-1 text-[11px] text-faint">total</p>
    </div>
  </div>
</template>
