<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { LoaderCircle, ScrollText, TriangleAlert, WandSparkles } from '@lucide/vue'
import AppDialog from './AppDialog.vue'
import { useGame } from '../composables/useGame'
import { estimateTokens } from '../lib/contextBudget'
import { formatNumber } from '../lib/format'
import { useConfirm } from '../composables/useConfirm'
import { useToasts } from '../composables/useToasts'

const { memoryOpen, gameState, updateMemory, loading, memoryPending, compacting, compactMemory } = useGame()
const { push } = useToasts()
const { ask } = useConfirm()
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

async function compact() {
  if (compacting.value || loading.value || memoryPending.value) return
  const result = await ask({
    title: '¿Compactar la memoria?',
    message:
      'El modelo reescribirá la memoria actual para eliminar redundancias usando el esfuerzo del Cronista. No se guardará hasta que pulses «Guardar memoria».',
    confirmLabel: 'Compactar',
    cancelLabel: 'Cancelar',
  })
  if (result !== 'confirm') return
  try {
    text.value = await compactMemory(text.value)
    push('Memoria compactada. Revísala y pulsa «Guardar memoria».', { tone: 'success' })
  } catch (error) {
    push(`No se pudo compactar: ${(error as Error)?.message ?? 'error'}`, { tone: 'error' })
  }
}
</script>

<template>
  <AppDialog
    :open="memoryOpen"
    title="Memoria de la partida"
    description="Hoja de personaje, inventario, dinero, condiciones, misiones, pistas y PNJs. Se reinyecta en cada turno y prevalece sobre el historial."
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
      placeholder="Escena: ...&#10;Hoja: ...&#10;Inventario: ...&#10;Dinero: ...&#10;Pistas y documentos: ..."
      :readonly="compacting"
      data-autofocus
    />
    <p class="field-hint">
      ~{{ formatNumber(tokens) }} tokens · cada sección empieza con «Título:» y puede tener varias
      líneas debajo. «Compactar» reescribe la memoria con el modelo; revísala antes de guardar.
    </p>
    <template #footer>
      <button
        type="button"
        class="btn-secondary mr-auto"
        :disabled="compacting || loading || memoryPending || !text.trim()"
        @click="compact"
      >
        <LoaderCircle v-if="compacting" class="h-4 w-4 animate-spin" />
        <WandSparkles v-else class="h-4 w-4" />
        {{ compacting ? 'Compactando…' : 'Compactar' }}
      </button>
      <button type="button" class="btn-ghost" :disabled="compacting" @click="memoryOpen = false">
        Cancelar
      </button>
      <button
        type="button"
        class="btn-primary"
        :disabled="!changed || loading || compacting || memoryPending"
        @click="save"
      >
        Guardar memoria
      </button>
    </template>
  </AppDialog>
</template>
