<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { Volume2, Pause, Play, Dices } from '@lucide/vue'
import type { ChatMessage } from '../types'
import { useGame } from '../composables/useGame'

const props = defineProps<{ message: ChatMessage; isLast: boolean }>()
const game = useGame()

marked.setOptions({ breaks: true, gfm: true })

const rendered = computed(() => {
  if (props.message.role !== 'assistant') return ''
  return DOMPurify.sanitize(marked.parse(props.message.display) as string)
})

const isUser = computed(() => props.message.role === 'user')
const showOptions = computed(
  () =>
    props.isLast &&
    !isUser.value &&
    !props.message.diceRequest &&
    props.message.options.length > 0,
)
const speaking = computed(() => game.speakingId.value === props.message.id)
const paused = computed(() => game.ttsPaused.value)
</script>

<template>
  <article
    :id="`msg-${message.id}`"
    class="animate-fade-up scroll-mt-4"
  >
    <div
      class="mb-1.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em]"
      :class="isUser ? 'justify-end text-muted' : 'text-gold'"
    >
      <span>{{ isUser ? 'Tú' : 'Dungeon Master' }}</span>
    </div>

    <div
      class="rounded-2xl border px-4 py-3 shadow-lg shadow-black/10"
      :class="
        isUser
          ? 'ml-auto w-fit max-w-[82%] border-gold-dim/40 bg-[#3a2c1c] text-[#f6ecd5]'
          : 'w-full border-divider bg-[#17141b]'
      "
    >
      <div
        v-if="isUser"
        class="whitespace-pre-wrap text-[15px] leading-7"
      >{{ message.display }}</div>
      <div
        v-else
        class="dm-markdown"
        v-html="rendered"
      />
    </div>

    <div
      v-if="!isUser"
      class="mt-1 flex items-center justify-end gap-2"
    >
      <span
        v-if="message.diceRequest"
        class="inline-flex items-center gap-1.5 rounded-full border border-gold-dim/40 px-2.5 py-1 text-[11px] text-gold"
      >
        <Dices class="h-3.5 w-3.5" />
        Tirada pendiente
      </span>
      <button
        class="icon-button h-9 w-9"
        :title="speaking && !paused ? 'Pausar lectura' : speaking && paused ? 'Reanudar lectura' : 'Escuchar mensaje'"
        @click="game.toggleSpeech(message)"
      >
        <Pause v-if="speaking && !paused" class="h-4 w-4" />
        <Play v-else-if="speaking && paused" class="h-4 w-4" />
        <Volume2 v-else class="h-4 w-4" />
      </button>
    </div>

    <div
      v-if="showOptions"
      class="mt-3 space-y-2"
    >
      <button
        v-for="(option, index) in message.options"
        :key="`${message.id}-${index}`"
        class="group flex w-full items-start gap-3 rounded-xl border border-gold-dim/60 bg-[#141019] px-4 py-2.5 text-left text-[14px] leading-6 text-parchment transition hover:border-gold hover:bg-gold/5"
        @click="game.send(option)"
      >
        <span
          class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gold-dim text-[11px] font-bold text-gold group-hover:border-gold"
        >{{ index + 1 }}</span>
        <span>{{ option }}</span>
      </button>
    </div>
  </article>
</template>
