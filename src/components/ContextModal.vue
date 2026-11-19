<script setup lang="ts">
import { computed } from 'vue'
import { Activity, Brain, Coins, Database, MessageSquare } from '@lucide/vue'
import { useGame } from '../composables/useGame'
import { estimateTokens } from '../lib/contextBudget'
import { formatNumber, formatTokens } from '../lib/format'
import AppDialog from './AppDialog.vue'

const { contextOpen, usage, messages, gameState, settings } = useGame()

const estimatedPrefix = computed(() => (usage.value?.estimated ? '~' : ''))
const memoryTokens = computed(() => estimateTokens(gameState.value))
const sent = computed(() => usage.value?.sentMessages ?? 0)
const noUsage = computed(() => !usage.value || usage.value.total <= 0)

const rows = computed(() => [
  { label: 'Entrada', value: usage.value?.prompt ?? 0 },
  { label: 'Salida', value: usage.value?.completion ?? 0 },
  { label: 'Razonamiento', value: usage.value?.reasoning ?? 0 },
  { label: 'Caché', value: usage.value?.cached ?? 0 },
])
</script>

<template>
  <AppDialog
    :open="contextOpen"
    title="Tokens del turno"
    :description="usage?.estimated ? 'Estimación: el proveedor no informó el uso' : 'Conteo informado por el proveedor en el último turno'"
    @close="contextOpen = false"
  >
    <template #icon>
      <Activity class="h-4 w-4" />
    </template>

    <div v-if="noUsage" class="rounded-xl border border-divider bg-surface-high px-4 py-3 text-sm text-muted">
      Todavía no hay datos. Envía un mensaje al Dungeon Master para medir el turno.
    </div>
    <div v-else class="space-y-4">
      <div class="grid grid-cols-2 gap-3">
        <div class="rounded-xl border border-divider bg-surface-high px-4 py-3">
          <p class="text-[11px] font-semibold tracking-wider text-faint uppercase">Contexto</p>
          <p class="mt-1 font-display text-2xl font-semibold text-gold-bright tabular-nums">
            {{ estimatedPrefix }}{{ formatTokens(usage?.total ?? 0) }}
          </p>
          <p class="text-[11px] text-faint">tokens del último turno</p>
        </div>
        <div class="rounded-xl border border-divider bg-surface-high px-4 py-3">
          <p class="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-faint uppercase">
            <Brain class="h-3.5 w-3.5" /> Razonamiento
          </p>
          <p class="mt-1 font-display text-2xl font-semibold text-gold-bright tabular-nums">
            {{ estimatedPrefix }}{{ formatTokens(usage?.reasoning ?? 0) }}
          </p>
          <p class="text-[11px] text-faint">incluidos en la salida</p>
        </div>
      </div>

      <dl class="space-y-2 rounded-xl border border-divider bg-surface-high px-4 py-3 text-sm">
        <div v-for="row in rows" :key="row.label" class="flex items-center justify-between gap-4">
          <dt class="text-muted">{{ row.label }}</dt>
          <dd class="font-mono text-parchment tabular-nums">{{ formatNumber(row.value) }}</dd>
        </div>
        <div class="flex items-center justify-between gap-4 border-t border-divider pt-2">
          <dt class="text-muted">Total</dt>
          <dd class="font-mono text-gold-bright tabular-nums">{{ formatNumber(usage?.total ?? 0) }}</dd>
        </div>
      </dl>

      <dl class="space-y-2 rounded-xl border border-divider bg-surface-high px-4 py-3 text-sm">
        <div class="flex items-center gap-2">
          <MessageSquare class="h-4 w-4 text-gold-dim" />
          <dt class="text-muted">Historial enviado:</dt>
          <dd class="font-mono text-parchment">{{ sent }} de {{ messages.length }} mensajes</dd>
        </div>
        <div class="flex items-center gap-2">
          <Database class="h-4 w-4 text-gold-dim" />
          <dt class="text-muted">Memoria de la partida:</dt>
          <dd class="font-mono text-parchment">~{{ formatNumber(memoryTokens) }} tokens</dd>
        </div>
        <div class="flex items-center gap-2">
          <Coins class="h-4 w-4 text-gold-dim" />
          <dt class="text-muted">Modelo:</dt>
          <dd class="truncate font-mono text-parchment">{{ settings.model }}</dd>
        </div>
      </dl>

      <p class="text-xs leading-5 text-faint">
        El razonamiento está incluido en la salida del turno y no se reenvía en el siguiente prompt. El
        contador muestra tokens, no un porcentaje de la ventana.
      </p>
    </div>
  </AppDialog>
</template>
