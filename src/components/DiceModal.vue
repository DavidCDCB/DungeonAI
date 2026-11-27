<script setup lang="ts">
import { computed } from 'vue'
import { Dices } from '@lucide/vue'
import { toParsedRoll } from '../lib/dice'
import { useGame } from '../composables/useGame'
import AppDialog from './AppDialog.vue'
import DiceRollCard from './DiceRollCard.vue'

const { diceOpen, diceResults, closeDice } = useGame()

const parsedResults = computed(() => diceResults.value?.map(toParsedRoll) ?? [])
</script>

<template>
  <AppDialog
    :open="diceOpen"
    title="Resultado"
    description="Enviado al Dungeon Master"
    size="lg"
    @close="closeDice"
  >
    <template #icon>
      <Dices class="h-4 w-4" />
    </template>

    <div class="space-y-2.5">
      <DiceRollCard
        v-for="(result, index) in parsedResults"
        :key="index"
        :roll="result"
        animate
        :delay="index * 120"
      />
    </div>

    <template #footer>
      <button type="button" class="btn-primary" data-autofocus @click="closeDice">Continuar</button>
    </template>
  </AppDialog>
</template>
