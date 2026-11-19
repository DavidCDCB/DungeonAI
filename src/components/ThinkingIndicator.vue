<script setup lang="ts">
import { computed } from 'vue'
import { useGame } from '../composables/useGame'
import { formatElapsed, formatNumber, formatRate } from '../lib/format'

const { phase, turnStartedAt, now, liveStats, settings, cancelTurn } = useGame()

const elapsed = computed(() => formatElapsed(now.value - turnStartedAt.value))
const label = computed(() => {
  if (phase.value === 'thinking') return 'El Dungeon Master medita su respuesta'
  if (phase.value === 'repairing') return 'Preparando tus opciones'
  if (phase.value === 'writing') return 'El Dungeon Master escribe'
  return 'El Dungeon Master consulta sus notas'
})
const thinking = computed(() => liveStats.value.reasoningTokens > 0)
const slow = computed(() => now.value - turnStartedAt.value > 45_000)
</script>

<template>
  <div class="flex items-center gap-4 py-1" role="status">
    <div class="relative h-9 w-9 shrink-0" aria-hidden="true">
      <div class="animate-orbit absolute inset-0 rounded-full border border-dashed border-gold-dim/70" />
      <div class="absolute inset-[9px] rounded-full bg-gold/70 shadow-[0_0_16px_rgb(214_179_106/0.7)]" />
    </div>
    <div class="min-w-0 flex-1">
      <p class="shimmer-text text-[15px] font-medium">{{ label }}…</p>
      <p class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-faint tabular-nums">
        <span>{{ elapsed }}</span>
        <template v-if="thinking">
          <span aria-hidden="true">·</span>
          <span>
            Razonamiento:
            <strong class="font-semibold text-parchment">~{{ formatNumber(liveStats.reasoningTokens) }}</strong>
            tokens
          </span>
          <span aria-hidden="true">·</span>
          <span
            class="rounded-md border border-divider bg-ink-soft px-1.5 py-0.5 font-mono text-[11px] text-gold-bright"
            title="Tokens de razonamiento por segundo (estimado)"
          >
            {{ liveStats.reasoningRate ? formatRate(liveStats.reasoningRate) : '— tok/s' }}
          </span>
        </template>
        <span v-else-if="phase === 'waiting'">· esperando el primer token</span>
        <template v-if="slow && settings.reasoning === 'max'">
          <span aria-hidden="true">·</span>
          <span>el razonamiento max puede tardar minutos</span>
        </template>
      </p>
    </div>
    <button type="button" class="btn-ghost btn-sm" @click="cancelTurn">Detener</button>
  </div>
</template>
