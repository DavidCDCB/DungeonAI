<script setup lang="ts">
import { computed } from 'vue'
import { useGame } from '../composables/useGame'
import { formatElapsed, formatNumber, formatRate } from '../lib/format'
import { PACE_LABELS, paceBars, paceIntensity, paceTier } from '../lib/pace'
import ReasoningOrb from './ReasoningOrb.vue'

const { phase, turnStartedAt, now, liveStats, settings, cancelTurn } = useGame()

const BARS = 5

const elapsed = computed(() => formatElapsed(now.value - turnStartedAt.value))
const label = computed(() => {
  if (phase.value === 'thinking') return 'El Dungeon Master medita su respuesta'
  if (phase.value === 'repairing') return 'Preparando tus opciones'
  if (phase.value === 'writing') return 'El Dungeon Master escribe'
  return 'El Dungeon Master consulta sus notas'
})
const thinking = computed(() => liveStats.value.reasoningTokens > 0)
const slow = computed(() => now.value - turnStartedAt.value > 45_000)

const speed = computed(() => liveStats.value.reasoningSpeed)
const tier = computed(() => paceTier(speed.value))
const litBars = computed(() => paceBars(speed.value, BARS))

/** Intensidad del orbe: sigue la velocidad real del razonamiento. */
const intensity = computed(() => {
  if (phase.value === 'writing' || phase.value === 'repairing') return 0.3
  if (!thinking.value) return 0.06
  return speed.value === null ? 0.15 : Math.max(0.05, paceIntensity(speed.value))
})

const speedTitle = computed(() => {
  const average = liveStats.value.reasoningRate
  return `Velocidad actual del razonamiento (últimos segundos, estimada)${
    average ? ` · media: ${formatRate(average)}` : ''
  }`
})
</script>

<template>
  <div class="flex items-center gap-4 py-1" role="status">
    <ReasoningOrb :intensity="intensity" />
    <div class="min-w-0 flex-1">
      <p class="shimmer-text text-[15px] font-medium">{{ label }}…</p>
      <div class="mt-1 space-y-1.5 text-xs text-faint tabular-nums" aria-live="off">
        <p class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span>{{ elapsed }}</span>
          <template v-if="thinking">
            <span aria-hidden="true">·</span>
            <span>
              Razonamiento:
              <strong class="font-semibold text-parchment">~{{ formatNumber(liveStats.reasoningTokens) }}</strong>
              tokens
            </span>
          </template>
          <span v-else-if="phase === 'waiting'">· esperando el primer token</span>
          <template v-if="slow && settings.reasoning === 'max'">
            <span aria-hidden="true">·</span>
            <span>el razonamiento max puede tardar minutos</span>
          </template>
        </p>
        <p v-if="thinking" class="flex items-center gap-1.5" :title="speedTitle" :data-tier="tier">
          <span class="flex h-3 items-end gap-[2px]" aria-hidden="true">
            <span
              v-for="n in BARS"
              :key="n"
              class="w-[3px] rounded-[1px] transition-[background-color,opacity] duration-300"
              :class="n <= litBars ? (tier === 'blazing' || tier === 'fast' ? 'bg-arcane' : 'bg-gold-bright') : 'bg-divider'"
              :style="{ height: `${3 + n * 1.8}px` }"
            />
          </span>
          <span
            class="inline-block min-w-[5.6rem] rounded-md border border-divider bg-ink-soft px-1.5 py-0.5 text-right font-mono text-[11px] text-gold-bright"
          >
            {{ speed === null ? '— tok/s' : formatRate(speed) }}
          </span>
          <span class="whitespace-nowrap text-muted">{{ PACE_LABELS[tier] }}</span>
        </p>
      </div>
    </div>
    <!-- En pantallas estrechas se detiene con el botón del compositor. -->
    <button type="button" class="btn-ghost btn-sm max-sm:hidden" @click="cancelTurn">Detener</button>
  </div>
</template>
