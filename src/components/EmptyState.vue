<script setup lang="ts">
import { Pencil, Upload } from '@lucide/vue'
import { useGame } from '../composables/useGame'
import AppLogo from './AppLogo.vue'

const { settings, configured, startAdventure, openSettings } = useGame()
</script>

<template>
  <section class="flex min-h-[62vh] flex-col items-center justify-center py-8 text-center">
    <AppLogo :size="76" glow />
    <p class="eyebrow mt-6">Una nueva crónica</p>
    <h2 class="mt-2 font-display text-3xl font-semibold text-gold-bright sm:text-4xl">
      La aventura te espera
    </h2>
    <p class="mt-3 max-w-lg text-[15px] leading-7 text-muted">
      Un Dungeon Master con IA narrará la historia de
      <span class="text-parchment">{{ settings.character }}</span>. Tú decides cada paso; los dados, el
      resto.
    </p>

    <div class="card mt-7 w-full max-w-md overflow-hidden text-left">
      <div class="grid grid-cols-2 gap-px bg-divider">
        <div class="bg-surface px-4 py-3">
          <p class="text-[11px] tracking-wide text-faint uppercase">Personaje</p>
          <p class="mt-0.5 truncate font-display text-base text-gold-bright">{{ settings.character }}</p>
        </div>
        <div class="bg-surface px-4 py-3">
          <p class="text-[11px] tracking-wide text-faint uppercase">Raza y clase</p>
          <p class="mt-0.5 truncate text-sm text-parchment">{{ settings.race }} · {{ settings.characterClass }}</p>
        </div>
        <div class="bg-surface px-4 py-3">
          <p class="text-[11px] tracking-wide text-faint uppercase">Mundo</p>
          <p class="mt-0.5 truncate text-sm text-parchment">{{ settings.world }}</p>
        </div>
        <div class="bg-surface px-4 py-3">
          <p class="text-[11px] tracking-wide text-faint uppercase">Tema</p>
          <p class="mt-0.5 truncate text-sm text-parchment">{{ settings.theme }}</p>
        </div>
      </div>
      <button
        type="button"
        class="flex w-full items-center justify-center gap-2 border-t border-divider px-4 py-2.5 text-xs text-muted transition hover:bg-white/[0.03] hover:text-gold-bright"
        @click="openSettings('campaign')"
      >
        <Pencil class="h-3.5 w-3.5" />
        Personalizar campaña
      </button>
    </div>

    <div class="mt-7 flex flex-wrap items-center justify-center gap-3">
      <button type="button" class="btn-primary px-6 py-3 text-base" @click="startAdventure">
        {{ configured ? 'Comenzar aventura' : 'Conectar proveedor' }}
      </button>
      <button type="button" class="btn-ghost py-3" @click="openSettings('data')">
        <Upload class="h-4 w-4" />
        Importar partida
      </button>
    </div>
    <p class="mt-4 max-w-sm text-xs leading-5 text-faint">
      {{
        configured
          ? 'El DM te pedirá tus atributos y presentará la escena inicial. También puedes escribir abajo cómo quieres empezar.'
          : 'Necesitas una API key o un servidor local compatible con OpenAI.'
      }}
    </p>
  </section>
</template>
