<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ScrollText, TriangleAlert } from '@lucide/vue'
import AppDialog from './AppDialog.vue'
import { useGame } from '../composables/useGame'
import { estimateTokens } from '../lib/contextBudget'
import { formatNumber } from '../lib/format'
import { useToasts } from '../composables/useToasts'

const { memoryOpen, gameState, updateMemory, loading } = useGame()
const { push } = useToasts()
const text = ref('')

watch(memoryOpen, (open) => {
  if (open) text.value = gameState.value
})

const tokens = computed(() => estimateTokens(text.value))
const hasSecrets = computed(() => /^\s*trama/im.test(text.value))
const changed = computed(() => text.value.trim() !== gameState.value.trim())

function save() {
  updateMemory(text.value)
  memoryOpen.value = false
  push('Memoria actualizada. El DM la usará desde el próximo turno.', { tone: 'success' })
}
</script>

<template>
  <AppDialog
    :open="memoryOpen"
    title="Memoria de la partida"
    description="Hoja de personaje, inventario, dinero, condiciones, misiones y PNJs. Se reinyecta en cada turno y prevalece sobre el historial."
    size="lg"
    @close="memoryOpen = false"
  >
    <template #icon>
      <ScrollText class="h-4 w-4" />
    </template>
    <p
      v-if="hasSecrets"
      class="mb-3 flex items-start gap-2 rounded-xl border border-arcane/30 bg-arcane/[0.06] px-3 py-2 text-xs leading-5 text-arcane"
    >
      <TriangleAlert class="mt-0.5 h-3.5 w-3.5 shrink-0" />
      Incluye la sección «Trama (solo DM)», con secretos de la historia.
    </p>
    <label for="memory-editor" class="field-label">Memoria</label>
    <textarea
      id="memory-editor"
      v-model="text"
      rows="16"
      spellcheck="false"
      class="field resize-y font-mono text-[12.5px] leading-5 pointer-coarse:text-base"
      placeholder="Escena: ...&#10;Hoja: ...&#10;Inventario: ...&#10;Dinero: ..."
      data-autofocus
    />
    <p class="field-hint">~{{ formatNumber(tokens) }} tokens · cada sección empieza con «Título:» en su propia línea.</p>
    <template #footer>
      <button type="button" class="btn-ghost" @click="memoryOpen = false">Cancelar</button>
      <button type="button" class="btn-primary" :disabled="!changed || loading" @click="save">
        Guardar memoria
      </button>
    </template>
  </AppDialog>
</template>
