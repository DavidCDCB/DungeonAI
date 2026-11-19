<script setup lang="ts">
import { computed } from 'vue'
import { TriangleAlert } from '@lucide/vue'
import AppDialog from './AppDialog.vue'
import { useConfirm } from '../composables/useConfirm'

const { pending, answer } = useConfirm()
const open = computed(() => pending.value !== null)
</script>

<template>
  <AppDialog
    :open="open"
    :title="pending?.title ?? ''"
    size="sm"
    @close="answer('cancel')"
  >
    <template #icon>
      <TriangleAlert class="h-4 w-4" />
    </template>
    <p class="text-sm leading-6 text-muted">{{ pending?.message }}</p>
    <template #footer>
      <button type="button" class="btn-ghost" data-autofocus @click="answer('cancel')">
        {{ pending?.cancelLabel ?? 'Cancelar' }}
      </button>
      <button
        v-if="pending?.secondaryLabel"
        type="button"
        class="btn-secondary"
        @click="answer('secondary')"
      >
        {{ pending.secondaryLabel }}
      </button>
      <button
        type="button"
        :class="pending?.danger ? 'btn-danger' : 'btn-primary'"
        @click="answer('confirm')"
      >
        {{ pending?.confirmLabel ?? 'Aceptar' }}
      </button>
    </template>
  </AppDialog>
</template>
