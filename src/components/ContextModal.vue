<script setup lang="ts">
import { computed } from 'vue'
import { X, Activity, Brain, Database, MessageSquare, Coins } from '@lucide/vue'
import { useGame } from '../composables/useGame'
import { estimateTokens } from '../lib/contextBudget'

const { contextOpen, usage, messages, gameState, formatNumber, formatTokens, settings } = useGame()

const estimatedPrefix = computed(() => (usage.value?.estimated ? '~' : ''))
const memoryTokens = computed(() => estimateTokens(gameState.value))
const sent = computed(() => usage.value?.sentMessages ?? 0)
const noUsage = computed(() => !usage.value || usage.value.total <= 0)

function close() {
  contextOpen.value = false
}
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="contextOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      @click.self="close"
    >
      <div class="card w-full max-w-lg shadow-2xl">
        <header class="flex items-center justify-between border-b border-divider px-6 py-4">
          <div class="flex items-center gap-3">
            <div class="flex h-9 w-9 items-center justify-center rounded-xl border border-gold-dim/50 bg-gold/10">
              <Activity class="h-4 w-4 text-gold" />
            </div>
            <div>
              <h2 class="font-serif text-xl text-gold-bright">Tokens del turno</h2>
              <p class="text-xs text-muted">Conteo exacto del último turno</p>
            </div>
          </div>
          <button class="icon-button" title="Cerrar" @click="close">
            <X class="h-5 w-5" />
          </button>
        </header>

        <div class="space-y-4 px-6 py-5">
          <div v-if="noUsage" class="rounded-xl border border-divider bg-surface-high px-4 py-3 text-sm text-muted">
            Todavía no hay datos. Envía un mensaje al Dungeon Master para medir el turno.
          </div>
          <template v-else>
            <div class="grid grid-cols-2 gap-3">
              <div class="rounded-xl border border-divider bg-surface-high px-4 py-3">
                <p class="text-[10px] font-bold uppercase tracking-wider text-muted">Contexto</p>
                <p class="mt-1 text-2xl font-semibold text-gold-bright">
                  {{ estimatedPrefix }}{{ formatTokens(usage?.total ?? 0) }}
                </p>
                <p class="text-[11px] text-muted">tokens del último turno</p>
              </div>
              <div class="rounded-xl border border-divider bg-surface-high px-4 py-3">
                <p class="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">
                  <Brain class="h-3.5 w-3.5" /> Razonamiento
                </p>
                <p class="mt-1 text-2xl font-semibold text-gold-bright">
                  {{ estimatedPrefix }}{{ formatTokens(usage?.reasoning ?? 0) }}
                </p>
                <p class="text-[11px] text-muted">incluidos en la salida</p>
              </div>
            </div>

            <div class="space-y-2 rounded-xl border border-divider bg-surface-high px-4 py-3 text-sm">
              <div class="flex items-center justify-between gap-4">
                <span class="text-muted">Entrada</span>
                <span class="font-mono text-parchment">{{ formatNumber(usage?.prompt ?? 0) }}</span>
              </div>
              <div class="flex items-center justify-between gap-4">
                <span class="text-muted">Salida</span>
                <span class="font-mono text-parchment">{{ formatNumber(usage?.completion ?? 0) }}</span>
              </div>
              <div class="flex items-center justify-between gap-4">
                <span class="text-muted">Razonamiento</span>
                <span class="font-mono text-parchment">{{ formatNumber(usage?.reasoning ?? 0) }}</span>
              </div>
              <div class="flex items-center justify-between gap-4">
                <span class="text-muted">Total</span>
                <span class="font-mono text-gold">{{ formatNumber(usage?.total ?? 0) }}</span>
              </div>
              <div class="flex items-center justify-between gap-4">
                <span class="text-muted">Caché</span>
                <span class="font-mono text-parchment">{{ formatNumber(usage?.cached ?? 0) }}</span>
              </div>
            </div>

            <div class="space-y-2 rounded-xl border border-divider bg-surface-high px-4 py-3 text-sm">
              <div class="flex items-center gap-2 text-parchment">
                <MessageSquare class="h-4 w-4 text-gold-dim" />
                <span class="text-muted">Historial enviado:</span>
                <span class="font-mono">{{ sent }} de {{ messages.length }} mensajes</span>
              </div>
              <div class="flex items-center gap-2 text-parchment">
                <Database class="h-4 w-4 text-gold-dim" />
                <span class="text-muted">Memoria de la partida:</span>
                <span class="font-mono">~{{ formatNumber(memoryTokens) }} tokens</span>
              </div>
              <div class="flex items-center gap-2 text-parchment">
                <Coins class="h-4 w-4 text-gold-dim" />
                <span class="text-muted">Modelo:</span>
                <span class="font-mono">{{ settings.model }}</span>
              </div>
            </div>

            <p class="text-[11px] leading-5 text-muted">
              El razonamiento está incluido en la salida del turno y no se reenvía en el siguiente prompt.
              El contador muestra tokens, no un porcentaje de la ventana.
            </p>
          </template>
        </div>
      </div>
    </div>
  </Transition>
</template>
