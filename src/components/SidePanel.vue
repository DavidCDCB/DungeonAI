<script setup lang="ts">
import { computed, type Component } from 'vue'
import {
  Activity,
  Backpack,
  ChevronDown,
  ChevronRight,
  Coins,
  Eye,
  EyeOff,
  Flag,
  HeartPulse,
  MapPin,
  NotebookPen,
  Pencil,
  ScrollText,
  Skull,
  Swords,
  Users,
  Volume2,
} from '@lucide/vue'
import { useGame } from '../composables/useGame'
import { isActiveCombat, memoryEntries } from '../lib/gameState'
import { providerFor } from '../lib/providers'
import { formatNumber, formatTokens } from '../lib/format'

const {
  settings,
  gameState,
  usage,
  browserVoices,
  contextOpen,
  memoryOpen,
  openSettings,
  setAutoRead,
  updateSetting,
} = useGame()

const icons: Record<string, Component> = {
  Escena: MapPin,
  Combate: Swords,
  'Hoja de personaje': ScrollText,
  Inventario: Backpack,
  Dinero: Coins,
  'Condiciones y efectos': HeartPulse,
  Misiones: Flag,
  'PNJs y notas': Users,
  'Trama (solo DM)': Skull,
  Notas: NotebookPen,
}

const entries = computed(() => memoryEntries(gameState.value))
const scene = computed(() => entries.value.find((entry) => entry.title === 'Escena'))
const combat = computed(() => {
  const entry = entries.value.find((item) => item.title === 'Combate')
  return entry && isActiveCombat(entry.body) ? entry : null
})
const details = computed(() =>
  entries.value.filter((entry) => entry.title !== 'Escena' && entry.title !== 'Combate'),
)
const hasSecret = computed(() => details.value.some((entry) => entry.secret))

const voiceLabel = computed(() => {
  const voice = browserVoices.value.find((item) => item.voiceURI === settings.browserVoice)
  return voice ? `${voice.name} · ${voice.lang}` : 'Automática (mejor voz en español)'
})

const providerLabel = computed(() => providerFor(settings.baseUrl).label)
</script>

<template>
  <div class="space-y-4">
    <section class="card overflow-hidden">
      <div class="bg-gradient-to-br from-gold/[0.12] via-gold/[0.03] to-transparent px-4 pt-4 pb-3">
        <p class="eyebrow">Personaje</p>
        <p class="mt-2 truncate font-display text-2xl font-semibold text-gold-bright">
          {{ settings.character }}
        </p>
        <p class="text-sm text-muted">{{ settings.race }} · {{ settings.characterClass }}</p>
      </div>
      <dl class="space-y-1.5 border-t border-divider px-4 py-3 text-xs">
        <div class="flex justify-between gap-3">
          <dt class="text-faint">Mundo</dt>
          <dd class="text-right text-parchment">{{ settings.world }}</dd>
        </div>
        <div class="flex justify-between gap-3">
          <dt class="text-faint">Tema</dt>
          <dd class="text-right text-parchment">{{ settings.theme }}</dd>
        </div>
      </dl>
      <button
        type="button"
        class="flex w-full items-center gap-2 border-t border-divider px-4 py-2.5 text-xs text-muted transition hover:bg-white/[0.03] hover:text-gold-bright"
        @click="openSettings('campaign')"
      >
        <Pencil class="h-3.5 w-3.5" />
        Editar campaña
      </button>
    </section>

    <section v-if="combat" class="card border-error/40 bg-error/[0.06] p-4">
      <p class="eyebrow text-error">
        <Swords class="h-3.5 w-3.5" />
        En combate
      </p>
      <p class="mt-2 text-xs leading-5 whitespace-pre-wrap text-parchment">{{ combat.body }}</p>
    </section>

    <section v-if="scene" class="card p-4">
      <p class="eyebrow">
        <MapPin class="h-3.5 w-3.5" />
        Escena
      </p>
      <p class="mt-2 text-xs leading-5 whitespace-pre-wrap text-parchment">{{ scene.body }}</p>
    </section>

    <section class="card p-4">
      <div class="flex items-center">
        <p class="eyebrow">
          <ScrollText class="h-3.5 w-3.5" />
          Memoria
        </p>
        <button
          type="button"
          class="ml-auto inline-flex items-center gap-1 text-xs text-muted hover:text-gold-bright"
          @click="memoryOpen = true"
        >
          <Pencil class="h-3 w-3" />
          Editar
        </button>
      </div>
      <p v-if="!entries.length" class="mt-3 text-xs leading-5 text-muted">
        Aún no hay memoria. El DM la crea en cada turno con la hoja de personaje, el inventario, el
        dinero, las misiones y los PNJs.
      </p>
      <div v-else class="mt-2 divide-y divide-divider">
        <template v-for="entry in details" :key="entry.title">
          <details
            v-if="!entry.secret || settings.showSecrets"
            class="group/entry py-0.5"
            :open="entry.title === 'Hoja de personaje'"
          >
            <summary
              class="flex cursor-pointer list-none items-center gap-2 rounded-lg py-2 text-sm text-parchment hover:text-gold-bright [&::-webkit-details-marker]:hidden"
            >
              <component :is="icons[entry.title] ?? NotebookPen" class="h-3.5 w-3.5 text-gold-dim" />
              <span class="flex-1">{{ entry.title }}</span>
              <ChevronDown class="h-3.5 w-3.5 text-faint transition group-open/entry:rotate-180" />
            </summary>
            <p
              class="pb-2.5 pl-5.5 text-xs leading-5 whitespace-pre-wrap"
              :class="entry.secret ? 'text-arcane/90' : 'text-muted'"
            >{{ entry.body }}</p>
          </details>
        </template>
      </div>
      <button
        v-if="hasSecret"
        type="button"
        class="mt-2 inline-flex items-center gap-1.5 text-[11px] text-faint hover:text-arcane"
        @click="updateSetting('showSecrets', !settings.showSecrets)"
      >
        <component :is="settings.showSecrets ? EyeOff : Eye" class="h-3.5 w-3.5" />
        {{ settings.showSecrets ? 'Ocultar la trama secreta del DM' : 'Mostrar la trama secreta del DM (spoilers)' }}
      </button>
    </section>

    <section class="card p-4">
      <p class="eyebrow">
        <Activity class="h-3.5 w-3.5" />
        Tokens
      </p>
      <p class="mt-3 font-display text-2xl font-semibold text-gold-bright tabular-nums">
        {{ usage ? `${usage.estimated ? '~' : ''}${formatTokens(usage.total)}` : '—' }}
      </p>
      <p class="text-[11px] text-faint">contexto del último turno</p>
      <dl class="mt-3 space-y-1.5 border-t border-divider pt-3 text-[11px]">
        <div class="flex justify-between">
          <dt class="text-faint">Razonamiento</dt>
          <dd class="font-mono text-parchment">{{ usage?.reasoning ? formatNumber(usage.reasoning) : '—' }}</dd>
        </div>
        <div class="flex justify-between gap-3">
          <dt class="text-faint">Proveedor</dt>
          <dd class="truncate text-right text-parchment">{{ providerLabel }}</dd>
        </div>
      </dl>
      <button
        type="button"
        class="mt-3 flex w-full items-center justify-between text-[11px] text-gold hover:text-gold-bright"
        @click="contextOpen = true"
      >
        Ver desglose
        <ChevronRight class="h-3.5 w-3.5" />
      </button>
    </section>

    <section class="card p-4">
      <p class="eyebrow">
        <Volume2 class="h-3.5 w-3.5" />
        Narración por voz
      </p>
      <p class="mt-2 text-xs leading-5 text-parchment">{{ voiceLabel }}</p>
      <label class="mt-3 flex cursor-pointer items-center justify-between gap-3 text-xs text-muted">
        Leer automáticamente
        <input
          :checked="settings.autoRead"
          type="checkbox"
          role="switch"
          class="h-4 w-4 accent-[#d6b36a]"
          @change="setAutoRead(!settings.autoRead)"
        >
      </label>
      <button
        type="button"
        class="mt-3 flex w-full items-center justify-between text-[11px] text-gold hover:text-gold-bright"
        @click="openSettings('reading')"
      >
        Voz, velocidad y lectura
        <ChevronRight class="h-3.5 w-3.5" />
      </button>
    </section>
  </div>
</template>
