<script setup lang="ts">
import { PencilLine } from '@lucide/vue'
import { isJokerOption, optionLabel } from '../lib/messages'
import { useGame } from '../composables/useGame'

defineProps<{ options: string[] }>()
const { settings, loading, send, draft, focusComposer } = useGame()

function customize(option: string) {
  draft.value = optionLabel(option)
  focusComposer()
}
</script>

<template>
  <section class="animate-fade-up" aria-labelledby="options-title">
    <h3 id="options-title" class="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span class="font-display text-xs font-semibold tracking-[0.16em] text-gold uppercase">
        ¿Qué hace {{ settings.character }}?
      </span>
      <span class="hidden text-xs text-faint sm:inline">Pulsa 1–5 o escribe tu propia acción</span>
    </h3>
    <ol class="grid gap-2">
      <li v-for="(option, index) in options" :key="`${index}-${option}`" class="group relative">
        <button
          type="button"
          class="flex w-full items-start gap-3 rounded-xl border py-3 pr-12 pl-3.5 text-left transition disabled:cursor-not-allowed disabled:opacity-50"
          :class="
            isJokerOption(option)
              ? 'border-arcane/35 bg-arcane/[0.06] hover:border-arcane/80 hover:bg-arcane/10'
              : 'border-gold-dim/40 bg-surface/60 hover:border-gold hover:bg-gold/[0.06]'
          "
          :disabled="loading"
          @click="send(option)"
        >
          <span
            class="kbd mt-0.5 h-6 min-w-6 text-[11px] transition"
            :class="isJokerOption(option) ? 'group-hover:border-arcane group-hover:text-arcane' : 'group-hover:border-gold group-hover:text-gold-bright'"
            aria-hidden="true"
          >{{ index + 1 }}</span>
          <span class="flex-1 text-[15px] leading-6 text-parchment">
            {{ optionLabel(option) }}
            <span
              v-if="isJokerOption(option)"
              class="ml-1.5 inline-flex translate-y-[-1px] items-center gap-1 rounded-full border border-arcane/40 px-1.5 py-px align-middle text-[10px] font-semibold tracking-wider text-arcane uppercase"
            >🃏 Comodín</span>
          </span>
        </button>
        <button
          type="button"
          class="icon-btn-sm absolute top-2 right-2 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
          :aria-label="`Editar la opción ${index + 1} antes de enviarla`"
          title="Editar antes de enviar"
          :disabled="loading"
          @click="customize(option)"
        >
          <PencilLine class="h-4 w-4" />
        </button>
      </li>
    </ol>
  </section>
</template>
