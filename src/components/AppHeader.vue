<script setup lang="ts">
import { Download, PanelRight, RotateCcw, Settings, WifiOff } from '@lucide/vue'
import { useGame } from '../composables/useGame'
import { usePwa } from '../composables/usePwa'
import AppLogo from './AppLogo.vue'

const emit = defineEmits<{ newGame: [] }>()
const { settings, loading, panelOpen, openSettings, hasMessages } = useGame()
const { online, canInstall, install } = usePwa()
</script>

<template>
  <header
    class="shrink-0 border-b border-divider/80 bg-ink/80 px-3 backdrop-blur-md sm:px-5"
    style="padding-top: env(safe-area-inset-top)"
  >
    <div class="mx-auto flex h-14 max-w-[1600px] items-center gap-2 sm:gap-3">
      <AppLogo :size="34" />
      <div class="min-w-0 flex-1">
        <h1 class="font-display text-[17px] leading-none font-bold tracking-[0.08em] text-gold-bright sm:text-lg">
          Dungeon AI
        </h1>
        <p class="mt-1 truncate text-xs text-muted">
          Crónicas de {{ settings.character }}<span class="hidden sm:inline"> · {{ settings.world }}</span>
        </p>
      </div>

      <span
        v-if="!online"
        class="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-[11px] text-warning"
      >
        <WifiOff class="h-3.5 w-3.5" />
        <span class="hidden sm:inline">Sin conexión</span>
      </span>

      <button
        type="button"
        class="hidden items-center gap-2 rounded-full border border-divider bg-surface px-3 py-1.5 text-[11px] text-muted transition hover:border-gold-dim hover:text-parchment lg:inline-flex"
        title="Modelo y razonamiento"
        @click="openSettings('connection')"
      >
        <span class="h-1.5 w-1.5 rounded-full" :class="online ? 'bg-success' : 'bg-warning'" />
        {{ settings.model }}
        <span class="text-faint">·</span>
        {{ settings.reasoning }}
      </button>

      <button v-if="canInstall" type="button" class="btn-secondary btn-sm" @click="install">
        <Download class="h-3.5 w-3.5" />
        <span class="hidden sm:inline">Instalar app</span>
        <span class="sm:hidden">Instalar</span>
      </button>

      <button
        type="button"
        class="icon-btn"
        aria-label="Nueva partida"
        title="Nueva partida"
        :disabled="loading || !hasMessages"
        @click="emit('newGame')"
      >
        <RotateCcw class="h-5 w-5" />
      </button>
      <button
        type="button"
        class="icon-btn xl:hidden"
        aria-label="Panel de la partida"
        title="Personaje y memoria"
        @click="panelOpen = true"
      >
        <PanelRight class="h-5 w-5" />
      </button>
      <button
        type="button"
        class="icon-btn"
        aria-label="Ajustes"
        title="Ajustes"
        @click="openSettings()"
      >
        <Settings class="h-5 w-5" />
      </button>
    </div>
  </header>
</template>
