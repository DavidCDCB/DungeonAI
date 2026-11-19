<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { X, Plus, Dices } from '@lucide/vue'
import type { DiceGroup, DiceRequest } from '../types'
import { DICE_TYPES, MAX_BONUS, MAX_DICE, MAX_GROUPS, parseDie } from '../lib/dice'
import { useGame } from '../composables/useGame'

const {
  diceOpen,
  diceGroups,
  loading,
  openDice,
  closeDice,
  confirmDice,
  diceSummary,
} = useGame()

const confirming = ref(false)
const pending = ref<DiceRequest[]>([])
const error = ref('')

watch(diceOpen, (open) => {
  if (open) {
    confirming.value = false
    error.value = ''
    pending.value = []
  }
})

const diceOptions = computed(() => DICE_TYPES.map((sides) => `d${sides}`))

function addRow() {
  if (diceGroups.value.length >= MAX_GROUPS) {
    error.value = `Máximo ${MAX_GROUPS} tiradas por mensaje.`
    return
  }
  const last = diceGroups.value[diceGroups.value.length - 1]
  diceGroups.value = [
    ...diceGroups.value,
    {
      die: last?.die ?? 'd20',
      count: last?.count || '1',
      bonus: last?.bonus || '0',
    },
  ]
  error.value = ''
}

function removeRow(index: number) {
  if (diceGroups.value.length <= 1) return
  diceGroups.value = diceGroups.value.filter((_, i) => i !== index)
}

function selectAll(event: Event) {
  const input = event.target as HTMLInputElement | null
  input?.select()
}

function prepareRoll() {
  error.value = ''
  const requests: DiceRequest[] = []
  for (const [index, row] of diceGroups.value.entries()) {
    const sides = parseDie(row.die)
    if (!sides) {
      error.value = `Tirada ${index + 1}: elige un dado válido.`
      return
    }
    const count = Number(row.count)
    if (!Number.isInteger(count) || count < 1 || count > MAX_DICE) {
      error.value = `Tirada ${index + 1}: cantidad entre 1 y ${MAX_DICE}.`
      return
    }
    const bonus = row.bonus.trim() === '' ? 0 : Number(row.bonus)
    if (!Number.isInteger(bonus) || Math.abs(bonus) > MAX_BONUS) {
      error.value = `Tirada ${index + 1}: bono entre -${MAX_BONUS} y ${MAX_BONUS}.`
      return
    }
    requests.push({ sides, count, bonus })
  }
  if (!requests.length) return
  if (loading.value) {
    error.value = 'Espera a que el Dungeon Master termine de narrar.'
    return
  }
  pending.value = requests
  confirming.value = true
}

async function confirm() {
  if (!pending.value.length) return
  await confirmDice(pending.value)
  confirming.value = false
}

function close() {
  confirming.value = false
  pending.value = []
  error.value = ''
  closeDice(true)
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
      v-if="diceOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      @click.self="close"
    >
      <div class="card max-h-[90vh] w-full max-w-2xl overflow-y-auto shadow-2xl">
        <header class="flex items-center justify-between border-b border-divider px-6 py-4">
          <div class="flex items-center gap-3">
            <div class="flex h-9 w-9 items-center justify-center rounded-xl border border-gold-dim/50 bg-gold/10">
              <Dices class="h-4 w-4 text-gold" />
            </div>
            <div>
              <h2 class="font-serif text-xl text-gold-bright">Lanzar dados</h2>
              <p class="text-xs text-muted">Combina varias tiradas y envíalas juntas al DM</p>
            </div>
          </div>
          <button class="icon-button" title="Cerrar" @click="close">
            <X class="h-5 w-5" />
          </button>
        </header>

        <div class="space-y-4 px-6 py-5">
          <template v-if="!confirming">
            <button class="btn-ghost !px-3 !py-1.5 text-[12px]" @click="addRow">
              <Plus class="mr-1 inline h-4 w-4" />
              Añadir tirada
            </button>

            <div
              v-for="(row, index) in diceGroups"
              :key="index"
              class="rounded-2xl border border-divider bg-surface-high/60 p-3"
            >
              <div class="flex items-center gap-2">
                <label class="block flex-1">
                  <span class="field-label">Dado</span>
                  <select v-model="row.die" class="field">
                    <option v-for="die in diceOptions" :key="die" :value="die">{{ die }}</option>
                  </select>
                </label>
                <button
                  class="icon-button mt-5 h-9 w-9"
                  :disabled="diceGroups.length <= 1"
                  title="Quitar tirada"
                  @click="removeRow(index)"
                >
                  <X class="h-4 w-4" />
                </button>
              </div>
              <div class="mt-3 grid grid-cols-2 gap-3">
                <label class="block">
                  <span class="field-label">Cantidad</span>
                  <input
                    v-model="row.count"
                    type="number"
                    min="1"
                    :max="MAX_DICE"
                    class="field"
                    @focus="selectAll"
                  >
                </label>
                <label class="block">
                  <span class="field-label">Bono</span>
                  <input
                    v-model="row.bonus"
                    type="number"
                    :min="-MAX_BONUS"
                    :max="MAX_BONUS"
                    class="field"
                    @focus="selectAll"
                  >
                </label>
              </div>
            </div>

            <p class="text-[11px] leading-5 text-muted">
              Bono: modificador que se suma o resta. La configuración se conserva al cerrar el diálogo
              y se reinicia después de lanzar los dados.
            </p>
          </template>

          <template v-else>
            <div class="rounded-2xl border border-gold-dim/40 bg-gold/5 px-4 py-4">
              <p class="text-sm text-parchment">
                ¿Lanzar {{ pending.length === 1 ? 'esta tirada' : 'estas tiradas' }} y enviar
                {{ pending.length === 1 ? 'el resultado' : 'los resultados' }} al Dungeon Master?
              </p>
              <ul class="mt-3 space-y-1 font-mono text-[13px] text-gold">
                <li v-for="(request, index) in pending" :key="index">
                  {{ index + 1 }}. {{ diceSummary([request]) }}
                </li>
              </ul>
            </div>
          </template>

          <p v-if="error" class="rounded-xl border border-error/40 bg-error/10 px-3 py-2 text-sm text-error">
            {{ error }}
          </p>
        </div>

        <footer class="flex items-center justify-end gap-3 border-t border-divider px-6 py-4">
          <template v-if="confirming">
            <button class="btn-ghost" @click="confirming = false">Cancelar</button>
            <button class="btn-gold" @click="confirm">Lanzar y enviar</button>
          </template>
          <template v-else>
            <button class="btn-ghost" @click="close">Cerrar</button>
            <button class="btn-gold" @click="prepareRoll">Lanzar</button>
          </template>
        </footer>
      </div>
    </div>
  </Transition>
</template>
