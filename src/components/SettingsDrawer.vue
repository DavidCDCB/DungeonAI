<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import {
  X,
  RefreshCw,
  Eye,
  EyeOff,
  Volume2,
  Database,
  KeyRound,
  Sparkles,
  SlidersHorizontal,
  Download,
  Upload,
  FileJson,
} from '@lucide/vue'
import type { Reasoning, Settings } from '../types'
import { REASONING_LEVELS, DEFAULT_SETTINGS } from '../types'
import { PROVIDERS, providerFor, requiresApiKey } from '../lib/providers'
import { useGame } from '../composables/useGame'

const {
  settings,
  settingsOpen,
  browserVoices,
  gameState,
  loading,
  loadVoices,
  saveConfig,
  updateMemory,
  exportProgress,
  importProgress,
} = useGame()

const draft = reactive<Settings>({ ...DEFAULT_SETTINGS })
const memoryDraft = ref('')
const error = ref('')
const showKey = ref(false)
const saving = ref(false)
const importInput = ref<HTMLInputElement | null>(null)
const transferMessage = ref('')
const transferError = ref('')

const providerId = ref('opencode')

const providerHint = computed(
  () => PROVIDERS.find((item) => item.id === providerId.value)?.hint ?? '',
)

function syncProviderId() {
  providerId.value = providerFor(draft.baseUrl).id
}

function onProviderChange(id: string) {
  providerId.value = id
  const preset = PROVIDERS.find((item) => item.id === id)
  if (preset && preset.id !== 'custom') draft.baseUrl = preset.baseUrl
}

watch(
  settingsOpen,
  (open) => {
    if (!open) return
    Object.assign(draft, settings)
    syncProviderId()
    memoryDraft.value = gameState.value
    error.value = ''
    transferMessage.value = ''
    transferError.value = ''
  },
  { immediate: true },
)

function close() {
  settingsOpen.value = false
}

async function save() {
  draft.baseUrl = draft.baseUrl.trim() || DEFAULT_SETTINGS.baseUrl
  draft.model = draft.model.trim() || DEFAULT_SETTINGS.model
  if (!draft.apiKey.trim() && requiresApiKey(draft.baseUrl)) {
    error.value = 'Falta la API key del proveedor.'
    return
  }
  error.value = ''
  saving.value = true
  try {
    updateMemory(memoryDraft.value)
    saveConfig({ ...draft })
  } finally {
    saving.value = false
  }
}

function refreshVoices() {
  loadVoices()
}

function onExport() {
  transferMessage.value = ''
  transferError.value = ''
  try {
    exportProgress()
    transferMessage.value = 'Progreso exportado. El archivo incluye la API key.'
  } catch (exportError) {
    transferError.value = `No se pudo exportar: ${(exportError as Error)?.message ?? 'error'}`
  }
}

function onImportClick() {
  if (loading.value) {
    transferError.value = 'Espera a que termine el turno antes de importar.'
    return
  }
  transferMessage.value = ''
  transferError.value = ''
  importInput.value?.click()
}

async function onImportChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const confirmed = window.confirm(
    'La importación reemplazará la partida, la memoria, los tokens y los ajustes actuales. ¿Continuar?',
  )
  if (!confirmed) return
  try {
    await importProgress(file)
    transferMessage.value = 'Progreso importado correctamente.'
    transferError.value = ''
  } catch (importError) {
    transferError.value = `No se pudo importar: ${(importError as Error)?.message ?? 'archivo inválido'}`
    transferMessage.value = ''
  }
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
      v-if="settingsOpen"
      class="fixed inset-0 z-50 flex justify-end bg-black/65 backdrop-blur-sm"
      @click.self="close"
    >
      <aside
        class="flex h-full w-full max-w-[540px] flex-col border-l border-divider bg-surface shadow-2xl"
      >
        <header class="flex items-center justify-between border-b border-divider px-6 py-4">
          <div class="flex items-center gap-3">
            <div class="flex h-9 w-9 items-center justify-center rounded-xl border border-gold-dim/50 bg-gold/10">
              <SlidersHorizontal class="h-4 w-4 text-gold" />
            </div>
            <div>
              <h2 class="font-serif text-xl text-gold-bright">Ajustes</h2>
              <p class="text-xs text-muted">Proveedor, campaña y voz</p>
            </div>
          </div>
          <button class="icon-button" title="Cerrar" @click="close">
            <X class="h-5 w-5" />
          </button>
        </header>

        <div class="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <section class="space-y-3">
            <div class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gold">
              <KeyRound class="h-4 w-4" />
              Proveedor
            </div>
            <label class="block">
              <span class="field-label">Servicio</span>
              <select
                :value="providerId"
                class="field"
                @change="onProviderChange(($event.target as HTMLSelectElement).value)"
              >
                <option v-for="preset in PROVIDERS" :key="preset.id" :value="preset.id">
                  {{ preset.label }}
                </option>
              </select>
              <p v-if="providerHint" class="mt-1 text-[11px] text-muted">{{ providerHint }}</p>
            </label>
            <label class="block">
              <span class="field-label">URL base</span>
              <input
                v-model="draft.baseUrl"
                class="field font-mono text-[12px]"
                placeholder="https://api.openai.com/v1"
                @input="syncProviderId"
              >
              <p class="mt-1 text-[11px] text-muted">
                Cualquier endpoint compatible con OpenAI. La app añade
                <code class="text-gold">/chat/completions</code>. Para una URL directa, el servidor
                debe permitir CORS.
              </p>
            </label>
            <label class="block">
              <span class="field-label">API key</span>
              <div class="relative">
                <input
                  v-model="draft.apiKey"
                  :type="showKey ? 'text' : 'password'"
                  class="field pr-11"
                  placeholder="Pega la key del proveedor"
                  autocomplete="off"
                >
                <button
                  type="button"
                  class="absolute inset-y-0 right-1 flex w-9 items-center justify-center text-muted hover:text-gold"
                  :title="showKey ? 'Ocultar key' : 'Mostrar key'"
                  @click="showKey = !showKey"
                >
                  <EyeOff v-if="showKey" class="h-4 w-4" />
                  <Eye v-else class="h-4 w-4" />
                </button>
              </div>
              <p class="mt-1 text-[11px] text-muted">
                Se guarda solo en este navegador y viaja como Authorization. Déjala vacía en
                servidores locales sin autenticación.
              </p>
            </label>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label class="block">
                <span class="field-label">Modelo</span>
                <input v-model="draft.model" class="field" placeholder="claude-haiku-5-5">
              </label>
              <label class="block">
                <span class="field-label">Razonamiento</span>
                <select v-model="draft.reasoning" class="field">
                  <option v-for="level in REASONING_LEVELS" :key="level" :value="level">
                    {{ level }}
                  </option>
                </select>
              </label>
            </div>
            <p class="rounded-xl border border-divider bg-surface-high px-3 py-2 text-[11px] leading-5 text-muted">
              <strong class="text-gold">max</strong> puede tardar varios minutos. La app reserva 64k tokens
              para la salida y recorta el historial más antiguo si no cabe en la ventana.
            </p>
          </section>

          <section class="space-y-3">
            <div class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gold">
              <Sparkles class="h-4 w-4" />
              Campaña
            </div>
            <label class="block">
              <span class="field-label">Tema</span>
              <input v-model="draft.theme" class="field" placeholder="Alta Fantasía">
            </label>
            <label class="block">
              <span class="field-label">Mundo</span>
              <input v-model="draft.world" class="field" placeholder="Faerûn (Reinos Olvidados)">
            </label>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label class="block">
                <span class="field-label">Personaje</span>
                <input v-model="draft.character" class="field" placeholder="Sabrina">
              </label>
              <label class="block">
                <span class="field-label">Clase</span>
                <input v-model="draft.characterClass" class="field" placeholder="Maga">
              </label>
              <label class="block">
                <span class="field-label">Raza</span>
                <input v-model="draft.race" class="field" placeholder="Humana">
              </label>
            </div>
          </section>

          <section class="space-y-3">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gold">
                <Volume2 class="h-4 w-4" />
                Voz / TTS
              </div>
              <button class="btn-ghost !px-2.5 !py-1 text-[11px]" @click="refreshVoices">
                <RefreshCw class="mr-1 inline h-3.5 w-3.5" />
                Actualizar
              </button>
            </div>

            <label class="block">
              <span class="field-label">Voz del navegador</span>
              <select v-model="draft.browserVoice" class="field">
                <option value="">Automática (mejor voz del navegador)</option>
                <option
                  v-for="voice in browserVoices"
                  :key="voice.voiceURI"
                  :value="voice.voiceURI"
                >
                  {{ voice.name }} · {{ voice.lang }}
                </option>
              </select>
            </label>
            <p class="text-[11px] leading-5 text-muted">
              Usa las voces instaladas en el navegador o el sistema. Elige una voz o deja
              la automática.
            </p>
            <label class="flex cursor-pointer items-center gap-2 text-sm text-parchment">
              <input v-model="draft.autoRead" type="checkbox" class="accent-[#d6b36a]">
              Leer automáticamente cada respuesta del DM
            </label>
          </section>

          <section class="space-y-3">
            <div class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gold">
              <Database class="h-4 w-4" />
              Memoria de la partida
            </div>
            <p class="text-[11px] leading-5 text-muted">
              Es la hoja de personaje, inventario, dinero, condiciones, misiones y PNJs que se reinyecta
              en cada turno. Puedes corregirla aquí.
            </p>
            <textarea
              v-model="memoryDraft"
              rows="9"
              class="field resize-y font-mono text-[12px] leading-5"
              placeholder="Hoja de personaje: ...&#10;Inventario: ...&#10;Dinero: ..."
            />
          </section>

          <section class="space-y-3">
            <div class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gold">
              <FileJson class="h-4 w-4" />
              Progreso
            </div>
            <p class="text-[11px] leading-5 text-muted">
              Exporta o importa todo en un archivo JSON: historial, memoria, dados, contador de
              tokens y ajustes (incluida la API key).
            </p>
            <div class="flex flex-wrap gap-2">
              <button class="btn-ghost flex-1 !justify-center" :disabled="loading" @click="onExport">
                <Download class="mr-2 inline h-4 w-4" />
                Exportar JSON
              </button>
              <button class="btn-ghost flex-1 !justify-center" :disabled="loading" @click="onImportClick">
                <Upload class="mr-2 inline h-4 w-4" />
                Importar JSON
              </button>
            </div>
            <input
              ref="importInput"
              type="file"
              accept="application/json,.json"
              class="hidden"
              @change="onImportChange"
            >
            <p v-if="transferMessage" class="rounded-xl border border-gold-dim/40 bg-gold/10 px-3 py-2 text-[11px] text-gold-bright">
              {{ transferMessage }}
            </p>
            <p v-if="transferError" class="rounded-xl border border-error/40 bg-error/10 px-3 py-2 text-[11px] text-error">
              {{ transferError }}
            </p>
          </section>

          <p v-if="error" class="rounded-xl border border-error/40 bg-error/10 px-3 py-2 text-sm text-error">
            {{ error }}
          </p>
        </div>

        <footer class="flex items-center justify-end gap-3 border-t border-divider px-6 py-4">
          <button class="btn-ghost" @click="close">Cancelar</button>
          <button class="btn-gold" :disabled="saving" @click="save">
            Guardar
          </button>
        </footer>
      </aside>
    </div>
  </Transition>
</template>
