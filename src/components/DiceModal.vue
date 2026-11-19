<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Dices, Minus, Plus, Sparkles, Trash2 } from '@lucide/vue'
import type { DiceGroup, DiceMode, DiceRequest } from '../types'
import {
  DICE_TYPES,
  MAX_BONUS,
  MAX_DICE,
  MAX_GROUPS,
  describeRequest,
  toGroup,
  toParsedRoll,
  validateGroup,
} from '../lib/dice'
import { useGame } from '../composables/useGame'
import AppDialog from './AppDialog.vue'
import DiceRollCard from './DiceRollCard.vue'

const { diceOpen, diceGroups, diceResults, diceSuggestions, loading, closeDice, rollAndSend } = useGame()

const error = ref('')

watch(diceOpen, (open) => {
  if (open) error.value = ''
})

const parsedResults = computed(() => diceResults.value?.map(toParsedRoll) ?? [])
const title = computed(() => (diceResults.value ? 'Resultado' : 'Lanzar dados'))

function preview(group: DiceGroup): string {
  const result = validateGroup(group)
  return typeof result === 'string' ? '—' : describeRequest(result)
}

function setDie(group: DiceGroup, sides: number) {
  group.die = `d${sides}`
  if (sides !== 20 && (group.mode === 'advantage' || group.mode === 'disadvantage')) group.mode = 'normal'
}

function step(group: DiceGroup, field: 'count' | 'bonus', delta: number) {
  const current = Number(group[field]) || 0
  const min = field === 'count' ? 1 : -MAX_BONUS
  const max = field === 'count' ? MAX_DICE : MAX_BONUS
  group[field] = String(Math.min(max, Math.max(min, current + delta)))
  if (field === 'count' && Number(group.count) !== 1 && group.mode !== 'drop-lowest') group.mode = 'normal'
  if (field === 'count' && Number(group.count) < 2 && group.mode === 'drop-lowest') group.mode = 'normal'
}

function modesFor(group: DiceGroup): Array<{ id: DiceMode; label: string }> {
  const count = Number(group.count)
  if (group.die === 'd20' && count === 1) {
    return [
      { id: 'normal', label: 'Normal' },
      { id: 'advantage', label: 'Ventaja' },
      { id: 'disadvantage', label: 'Desventaja' },
    ]
  }
  if (count >= 2) {
    return [
      { id: 'normal', label: 'Sumar todos' },
      { id: 'drop-lowest', label: 'Descartar el menor' },
    ]
  }
  return []
}

function addRow() {
  if (diceGroups.value.length >= MAX_GROUPS) {
    error.value = `Máximo ${MAX_GROUPS} tiradas por mensaje.`
    return
  }
  const last = diceGroups.value[diceGroups.value.length - 1]
  diceGroups.value = [...diceGroups.value, { ...(last ?? { die: 'd20', count: '1', bonus: '0' }) }]
  error.value = ''
}

function removeRow(index: number) {
  if (diceGroups.value.length <= 1) return
  diceGroups.value = diceGroups.value.filter((_, i) => i !== index)
}

function useSuggestion(requests: DiceRequest[]) {
  diceGroups.value = requests.map(toGroup)
  error.value = ''
}

function selectAll(event: Event) {
  ;(event.target as HTMLInputElement | null)?.select()
}

function roll() {
  error.value = ''
  const requests: DiceRequest[] = []
  for (const [index, group] of diceGroups.value.entries()) {
    const result = validateGroup(group)
    if (typeof result === 'string') {
      error.value = `Tirada ${index + 1}: ${result}.`
      return
    }
    requests.push(result)
  }
  if (loading.value) {
    error.value = 'Espera a que el Dungeon Master termine de narrar.'
    return
  }
  rollAndSend(requests)
}
</script>

<template>
  <AppDialog
    :open="diceOpen"
    :title="title"
    :description="diceResults ? 'Enviado al Dungeon Master' : 'Combina varias tiradas y envíalas juntas al DM'"
    size="lg"
    @close="closeDice"
  >
    <template #icon>
      <Dices class="h-4 w-4" />
    </template>

    <div v-if="diceResults" class="space-y-2.5">
      <DiceRollCard
        v-for="(result, index) in parsedResults"
        :key="index"
        :roll="result"
        animate
        :delay="index * 120"
      />
    </div>

    <div v-else class="space-y-4">
      <div v-if="diceSuggestions.length">
        <p class="field-label flex items-center gap-1.5">
          <Sparkles class="h-3.5 w-3.5 text-gold" />
          Sugeridas por el DM
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="suggestion in diceSuggestions"
            :key="suggestion.label"
            type="button"
            class="chip"
            @click="useSuggestion(suggestion.requests)"
          >
            {{ suggestion.label }}
          </button>
        </div>
      </div>

      <div
        v-for="(group, index) in diceGroups"
        :key="index"
        class="rounded-2xl border border-divider bg-surface-high/60 p-3.5"
      >
        <div class="flex items-center justify-between gap-2">
          <p class="text-xs font-medium text-muted">
            Tirada {{ index + 1 }} ·
            <span class="font-mono text-gold-bright">{{ preview(group) }}</span>
          </p>
          <button
            type="button"
            class="icon-btn-sm"
            :disabled="diceGroups.length <= 1"
            :aria-label="`Quitar tirada ${index + 1}`"
            @click="removeRow(index)"
          >
            <Trash2 class="h-4 w-4" />
          </button>
        </div>

        <div class="mt-2.5 grid grid-cols-4 gap-1.5 sm:grid-cols-7" role="group" :aria-label="`Dado de la tirada ${index + 1}`">
          <button
            v-for="sides in DICE_TYPES"
            :key="sides"
            type="button"
            class="rounded-lg border py-2 font-mono text-sm transition pointer-coarse:py-2.5"
            :class="
              group.die === `d${sides}`
                ? 'border-gold bg-gold/15 text-gold-bright'
                : 'border-divider bg-ink-soft text-muted hover:border-gold-dim hover:text-parchment'
            "
            :aria-pressed="group.die === `d${sides}`"
            @click="setDie(group, sides)"
          >
            d{{ sides }}
          </button>
        </div>

        <div class="mt-3 grid grid-cols-2 gap-3">
          <div>
            <span class="field-label">Cantidad</span>
            <div class="flex items-center rounded-xl border border-divider bg-ink-soft">
              <button type="button" class="icon-btn-sm h-10 w-10" aria-label="Menos dados" @click="step(group, 'count', -1)">
                <Minus class="h-4 w-4" />
              </button>
              <input
                v-model="group.count"
                type="number"
                inputmode="numeric"
                min="1"
                :max="MAX_DICE"
                :aria-label="`Cantidad de dados de la tirada ${index + 1}`"
                class="w-full min-w-0 bg-transparent text-center font-mono text-sm text-parchment outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                @focus="selectAll"
              >
              <button type="button" class="icon-btn-sm h-10 w-10" aria-label="Más dados" @click="step(group, 'count', 1)">
                <Plus class="h-4 w-4" />
              </button>
            </div>
          </div>
          <div>
            <span class="field-label">Modificador</span>
            <div class="flex items-center rounded-xl border border-divider bg-ink-soft">
              <button type="button" class="icon-btn-sm h-10 w-10" aria-label="Restar al modificador" @click="step(group, 'bonus', -1)">
                <Minus class="h-4 w-4" />
              </button>
              <input
                v-model="group.bonus"
                type="number"
                inputmode="numeric"
                :min="-MAX_BONUS"
                :max="MAX_BONUS"
                :aria-label="`Modificador de la tirada ${index + 1}`"
                class="w-full min-w-0 bg-transparent text-center font-mono text-sm text-parchment outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                @focus="selectAll"
              >
              <button type="button" class="icon-btn-sm h-10 w-10" aria-label="Sumar al modificador" @click="step(group, 'bonus', 1)">
                <Plus class="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div v-if="modesFor(group).length" class="mt-3">
          <div class="seg w-full" role="group" :aria-label="`Modo de la tirada ${index + 1}`">
            <button
              v-for="mode in modesFor(group)"
              :key="mode.id"
              type="button"
              class="seg-item flex-1"
              :aria-pressed="(group.mode ?? 'normal') === mode.id"
              @click="group.mode = mode.id"
            >
              {{ mode.label }}
            </button>
          </div>
        </div>
      </div>

      <button type="button" class="btn-ghost btn-sm" :disabled="diceGroups.length >= MAX_GROUPS" @click="addRow">
        <Plus class="h-3.5 w-3.5" />
        Añadir tirada
      </button>

      <p v-if="error" role="alert" class="rounded-xl border border-error/40 bg-error/10 px-3 py-2 text-sm text-error">
        {{ error }}
      </p>
    </div>

    <template #footer>
      <template v-if="diceResults">
        <button type="button" class="btn-primary" data-autofocus @click="closeDice">Continuar</button>
      </template>
      <template v-else>
        <p class="mr-auto hidden text-xs text-faint sm:block">El resultado se envía al DM al lanzar.</p>
        <button type="button" class="btn-ghost" @click="closeDice">Cerrar</button>
        <button type="button" class="btn-primary" :disabled="loading" data-autofocus @click="roll">
          <Dices class="h-4 w-4" />
          Lanzar y enviar
        </button>
      </template>
    </template>
  </AppDialog>
</template>
