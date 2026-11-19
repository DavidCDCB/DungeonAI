<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useGame } from '../composables/useGame'
import { formatElapsed, formatTokens } from '../lib/format'

const { phase, turnStartedAt, reasoningChars, settings, cancelTurn } = useGame()
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  timer = setInterval(() => (now.value = Date.now()), 1000)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

const elapsed = computed(() => formatElapsed(now.value - turnStartedAt.value))
const label = computed(() => {
  if (phase.value === 'thinking') return 'El Dungeon Master medita su respuesta'
  if (phase.value === 'repairing') return 'Preparando tus opciones'
  if (phase.value === 'writing') return 'El Dungeon Master escribe'
  return 'El Dungeon Master consulta sus notas'
})
const thoughts = computed(() =>
  reasoningChars.value > 0 ? `~${formatTokens(Math.ceil(reasoningChars.value / 3.5))} tokens de razonamiento` : '',
)
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
      <p class="mt-0.5 text-xs text-faint tabular-nums">
        {{ elapsed }}
        <template v-if="thoughts"> · {{ thoughts }}</template>
        <template v-if="slow && settings.reasoning === 'max'"> · el razonamiento max puede tardar minutos</template>
      </p>
    </div>
    <button type="button" class="btn-ghost btn-sm" @click="cancelTurn">Detener</button>
  </div>
</template>
