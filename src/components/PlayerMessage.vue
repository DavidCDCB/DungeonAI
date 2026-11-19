<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, Copy, Pencil } from '@lucide/vue'
import type { ChatMessage } from '../types'
import { parseRollMessage } from '../lib/dice'
import { useGame } from '../composables/useGame'
import { useToasts } from '../composables/useToasts'
import DiceRollCard from './DiceRollCard.vue'

const props = defineProps<{ message: ChatMessage }>()
const game = useGame()
const { push } = useToasts()
const copied = ref(false)

const rolls = computed(() => parseRollMessage(props.message.content))
const ooc = computed(() => /^<[\s\S]*>$/.test(props.message.content.trim()))
const oocText = computed(() => props.message.content.trim().slice(1, -1).trim())
const isStart = computed(() => /^<Comienza la campaña/i.test(props.message.content.trim()))

async function copy() {
  try {
    await navigator.clipboard.writeText(props.message.content)
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
    class="group flex animate-fade-up scroll-mt-4 flex-col"
    :class="isStart ? 'items-center' : 'items-end'"
    aria-label="Tu mensaje"
  >
    <div v-if="isStart" class="flex w-full items-center gap-3 text-xs text-faint">
      <span class="h-px flex-1 bg-gradient-to-r from-transparent to-divider" />
      <span class="font-display tracking-[0.2em] text-gold-dim uppercase">Comienza la crónica</span>
      <span class="h-px flex-1 bg-gradient-to-l from-transparent to-divider" />
    </div>

    <div v-else-if="rolls" class="w-full max-w-md space-y-2">
      <DiceRollCard v-for="(roll, index) in rolls" :key="index" :roll="roll" />
    </div>

    <div
      v-else-if="ooc"
      class="max-w-[85%] rounded-2xl rounded-br-md border border-dashed border-[#4a4152] bg-surface-high/70 px-4 py-2.5"
    >
      <p class="text-[10px] font-semibold tracking-[0.16em] text-faint uppercase">Fuera de personaje</p>
      <p class="mt-0.5 text-[15px] leading-relaxed whitespace-pre-wrap text-muted">{{ oocText }}</p>
    </div>

    <div
      v-else
      class="max-w-[85%] rounded-2xl rounded-br-md border border-gold-dim/35 bg-leather px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-[#f6ecd5] shadow-[0_12px_30px_-24px_rgb(0_0_0/0.9)]"
    >{{ message.display }}</div>

    <div
      v-if="!isStart"
      class="mt-1 flex items-center gap-0.5 transition-opacity pointer-fine:opacity-0 pointer-fine:group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100"
    >
      <button
        v-if="!rolls"
        type="button"
        class="icon-btn-sm"
        aria-label="Editar y reenviar desde aquí"
        title="Editar y reenviar desde aquí"
        :disabled="game.loading.value"
        @click="game.editMessage(message.id)"
      >
        <Pencil class="h-3.5 w-3.5" />
      </button>
      <button type="button" class="icon-btn-sm" aria-label="Copiar mensaje" title="Copiar" @click="copy">
        <Check v-if="copied" class="h-3.5 w-3.5 text-success" />
        <Copy v-else class="h-3.5 w-3.5" />
      </button>
    </div>
  </article>
</template>
