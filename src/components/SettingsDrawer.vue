<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import {
  BookOpen,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  FileText,
  FileUp,
  Globe,
  LayoutTemplate,
  HardDrive,
  LoaderCircle,
  Plug,
  RefreshCw,
  RotateCcw,
  ScrollText,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Square,
  Upload,
  Volume2,
  WandSparkles,
  XCircle,
} from '@lucide/vue'
import type { Settings } from '../types'
import { CONTEXT_WINDOWS, DEFAULT_SETTINGS, REASONING_LEVELS } from '../types'
import { PROVIDERS, providerFor, requiresApiKey } from '../lib/providers'
import { CancelledError, formatLore, generateLore, testConnection, type ConnectionTest } from '../lib/api'
import { LORE_TEMPLATE, LORE_WARN_RATIO, MAX_LORE_CHARS, loreTokens, normalizeLore } from '../lib/lore'
import { promptBase } from '../lib/prompt'
import { storageBytes, storageQuota } from '../lib/storage'
import { formatBytes, formatNumber } from '../lib/format'
import { useGame, type SettingsTab } from '../composables/useGame'
import { useToasts } from '../composables/useToasts'
import { useConfirm } from '../composables/useConfirm'
import { usePwa } from '../composables/usePwa'
import AppDialog from './AppDialog.vue'

const {
  settings,
  settingsOpen,
  settingsTab,
  browserVoices,
  loading,
  messages,
  refreshBrowserVoices,
  saveConfig,
  exportProgress,
  importProgress,
  previewVoice,
  stopSpeech,
} = useGame()
const { push } = useToasts()
const { ask } = useConfirm()
const { canInstall, installed, install } = usePwa()

const tabs: Array<{ id: SettingsTab; label: string; icon: typeof Plug }> = [
  { id: 'connection', label: 'Conexión', icon: Plug },
  { id: 'campaign', label: 'Campaña', icon: Sparkles },
  { id: 'world', label: 'Mundo', icon: Globe },
  { id: 'prompt', label: 'Prompt', icon: ScrollText },
  { id: 'reading', label: 'Lectura y voz', icon: BookOpen },
  { id: 'data', label: 'Datos', icon: HardDrive },
]

const THEMES = ['Alta Fantasía', 'Fantasía Oscura', 'Horror Gótico', 'Intriga Política', 'Aventura Pirata', 'Misterio', 'Comedia Heroica', 'Steampunk']
const WORLDS = [
  'Faerûn (Reinos Olvidados)',
  'Eberron',
  'Greyhawk',
  'Ravenloft',
  'Dragonlance (Krynn)',
  'Exandria',
  'The Witcher (El Continente)',
  'Skyrim (Tamriel)',
  'Elden Ring (Las Tierras Intermedias)',
  'El Señor de los Anillos (Tierra Media)',
  'Juego de Tronos (Poniente)',
  'Warhammer Fantasy',
  'Star Wars',
  'Mundo original',
]
const LORE_IDEAS = [
  'Cronología y momento de la historia',
  'Lugares y mapa',
  'Facciones y poderes',
  'PNJs con voz y motivaciones',
  'Magia y reglas del mundo',
  'Criaturas y amenazas',
  'Términos propios del mundo',
  'Lo que no debe cambiar',
]
const CLASSES = ['Bárbaro', 'Bardo', 'Brujo', 'Clérigo', 'Druida', 'Explorador', 'Guerrero', 'Hechicero', 'Mago', 'Monje', 'Paladín', 'Pícaro']
const RACES = ['Humana', 'Elfa', 'Semielfa', 'Enana', 'Mediana', 'Gnoma', 'Tiflin', 'Dracónida', 'Semiorca']
const PROMPT_MARKERS = ['{{tema}}', '{{mundo}}', '{{personaje}}', '{{nombre}}', '{{clase}}', '{{raza}}']

const draft = reactive<Settings>({ ...DEFAULT_SETTINGS })
const error = ref('')
const showKey = ref(false)
const providerId = ref('opencode')
const testing = ref(false)
const testResult = ref<ConnectionTest | null>(null)
const includeKey = ref(false)
const importInput = ref<HTMLInputElement | null>(null)
const usedBytes = ref(0)
const quotaBytes = ref<number | null>(null)
const usedShare = computed(() => (quotaBytes.value ? usedBytes.value / quotaBytes.value : 0))
const loreFile = ref<HTMLInputElement | null>(null)
const generating = ref(false)
let loreAbort: AbortController | null = null

const providerHint = computed(() => PROVIDERS.find((item) => item.id === providerId.value)?.hint ?? '')
const keyRequired = computed(() => requiresApiKey(draft.baseUrl))
const isHttpsPage = computed(() => typeof location !== 'undefined' && location.protocol === 'https:')
const mixedContent = computed(
  () =>
    isHttpsPage.value &&
    /^http:\/\//i.test(draft.baseUrl.trim()) &&
    !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(draft.baseUrl.trim()),
)
const dirty = computed(() =>
  (Object.keys(draft) as Array<keyof Settings>).some((key) => draft[key] !== settings[key]),
)
const customPromptActive = computed(() => Boolean(draft.customPrompt.trim()))
const loreTokenCount = computed(() => loreTokens(draft.lore))
const loreShare = computed(() => loreTokenCount.value / Math.max(draft.contextWindow, 1))
const loreTooBig = computed(() => loreShare.value > LORE_WARN_RATIO)
const hasLore = computed(() => Boolean(draft.lore.trim()))

function syncProviderId() {
  providerId.value = providerFor(draft.baseUrl).id
}

function onProviderChange(id: string) {
  providerId.value = id
  const preset = PROVIDERS.find((item) => item.id === id)
  if (preset && preset.id !== 'custom') draft.baseUrl = preset.baseUrl
  testResult.value = null
}

watch(
  settingsOpen,
  (open) => {
    if (!open) {
      stopSpeech()
      loreAbort?.abort()
      return
    }
    Object.assign(draft, settings)
    syncProviderId()
    error.value = ''
    testResult.value = null
    showKey.value = false
    usedBytes.value = storageBytes()
    void storageQuota().then((quota) => {
      quotaBytes.value = quota
    })
  },
  { immediate: true },
)

watch(
  () => [draft.baseUrl, draft.apiKey, draft.model],
  () => {
    testResult.value = null
  },
)

async function close() {
  if (dirty.value) {
    const result = await ask({
      title: '¿Descartar cambios?',
      message: 'Tienes cambios sin guardar en los ajustes.',
      confirmLabel: 'Descartar',
      cancelLabel: 'Seguir editando',
      danger: true,
    })
    if (result !== 'confirm') return
  }
  settingsOpen.value = false
}

function normalizeDraft() {
  draft.baseUrl = draft.baseUrl.trim() || DEFAULT_SETTINGS.baseUrl
  draft.model = draft.model.trim() || DEFAULT_SETTINGS.model
  draft.apiKey = draft.apiKey.trim()
  draft.character = draft.character.trim() || DEFAULT_SETTINGS.character
}

async function confirmReplacePrompt(message: string): Promise<boolean> {
  if (!draft.customPrompt.trim()) return true
  const result = await ask({
    title: '¿Reemplazar el prompt actual?',
    message,
    confirmLabel: 'Reemplazar',
    cancelLabel: 'Cancelar',
    danger: true,
  })
  return result === 'confirm'
}

async function loadBasePrompt() {
  const ok = await confirmReplacePrompt(
    'Se cargará el prompt original en el editor y se perderá el texto personalizado.',
  )
  if (ok) draft.customPrompt = promptBase
}

async function resetPrompt() {
  const ok = await confirmReplacePrompt(
    'Se vaciará el editor y se usará el prompt original de la app.',
  )
  if (ok) draft.customPrompt = ''
}

/**
 * Pide al modelo el lore: «generate» lo crea desde cero a partir del mundo y el
 * tema; «format» reescribe con la plantilla el texto que hay en el editor.
 * Si falla o se cancela, el texto anterior vuelve al editor.
 */
async function runLoreJob(kind: 'generate' | 'format') {
  normalizeDraft()
  if (requiresApiKey(draft.baseUrl) && !draft.apiKey) {
    push('Falta la API key para pedirle el contexto al modelo.', { tone: 'warning' })
    settingsTab.value = 'connection'
    return
  }
  const previous = draft.lore
  const controller = new AbortController()
  loreAbort = controller
  generating.value = true
  try {
    const task = kind === 'format' ? formatLore : generateLore
    const text = await task(
      { ...draft },
      {
        signal: controller.signal,
        onProgress: (partial) => {
          if (partial) draft.lore = partial.slice(0, MAX_LORE_CHARS)
        },
      },
    )
    draft.lore = text
    push(
      kind === 'format'
        ? 'Plantilla aplicada. Comprueba que no falte nada antes de guardar.'
        : 'Contexto generado. Revísalo y corrígelo antes de guardar.',
      {
        tone: 'success',
        action: previous.trim()
          ? { label: 'Deshacer', run: () => { draft.lore = previous } }
          : undefined,
      },
    )
  } catch (loreError) {
    draft.lore = previous
    if (loreError instanceof CancelledError) {
      push('Cancelado. Se restauró tu texto.', { tone: 'info' })
    } else {
      push((loreError as Error)?.message ?? 'No se pudo completar la petición.', { tone: 'error' })
    }
  } finally {
    generating.value = false
    loreAbort = null
  }
}

async function generateLoreText() {
  if (draft.lore.trim()) {
    const result = await ask({
      title: '¿Generar desde cero?',
      message:
        'El modelo escribirá un contexto nuevo a partir del mundo y el tema, y reemplazará el texto actual. Si quieres conservar tu texto, usa «Aplicar plantilla». Podrás deshacerlo.',
      confirmLabel: 'Generar y reemplazar',
      cancelLabel: 'Cancelar',
      danger: true,
    })
    if (result !== 'confirm') return
  }
  await runLoreJob('generate')
}

/** Con texto, el modelo lo reorganiza según la plantilla; vacío, inserta el esqueleto. */
async function applyTemplate() {
  if (!draft.lore.trim()) {
    insertLoreTemplate()
    return
  }
  await runLoreJob('format')
}

function stopLoreGeneration() {
  loreAbort?.abort()
}

function appendLore(text: string) {
  const joined = draft.lore.trim() ? `${draft.lore.trimEnd()}\n\n${text}` : text
  draft.lore = joined.slice(0, MAX_LORE_CHARS)
}

function insertLoreTemplate() {
  appendLore(LORE_TEMPLATE.trimEnd())
}

async function onLoreFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (file.size > 400_000) {
    push('El archivo es demasiado grande (máximo ~400 KB de texto).', { tone: 'error' })
    return
  }
  try {
    const text = normalizeLore(await file.text())
    if (!text) {
      push('El archivo está vacío.', { tone: 'warning' })
      return
    }
    const before = draft.lore.length
    appendLore(text)
    const truncated = draft.lore.length >= MAX_LORE_CHARS && before + text.length > MAX_LORE_CHARS
    push(truncated ? 'Archivo añadido; se recortó al límite del contexto.' : 'Archivo añadido al contexto.', {
      tone: truncated ? 'warning' : 'success',
    })
  } catch {
    push('No se pudo leer el archivo.', { tone: 'error' })
  }
}

async function clearLore() {
  if (!draft.lore.trim()) return
  const result = await ask({
    title: '¿Vaciar el contexto del mundo?',
    message: 'Se borrará el texto del editor. Podrás descartarlo cerrando los ajustes sin guardar.',
    confirmLabel: 'Vaciar',
    cancelLabel: 'Cancelar',
    danger: true,
  })
  if (result === 'confirm') draft.lore = ''
}

function save() {
  normalizeDraft()
  if (!draft.apiKey && requiresApiKey(draft.baseUrl)) {
    error.value = 'Falta la API key del proveedor.'
    settingsTab.value = 'connection'
    return
  }
  error.value = ''
  saveConfig({ ...draft })
  push('Ajustes guardados.', { tone: 'success' })
}

async function runTest() {
  normalizeDraft()
  testing.value = true
  testResult.value = null
  try {
    testResult.value = await testConnection({ ...draft })
  } finally {
    testing.value = false
  }
}

function onExport() {
  try {
    exportProgress(includeKey.value)
    push(
      includeKey.value
        ? 'Progreso exportado. El archivo incluye tu API key: no lo compartas.'
        : 'Progreso exportado (sin la API key).',
      { tone: 'success' },
    )
  } catch (exportError) {
    push(`No se pudo exportar: ${(exportError as Error)?.message ?? 'error'}`, { tone: 'error' })
  }
}

function onImportClick() {
  if (loading.value) {
    push('Espera a que termine el turno antes de importar.', { tone: 'warning' })
    return
  }
  importInput.value?.click()
}

async function onImportChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (messages.value.length) {
    const result = await ask({
      title: '¿Importar partida?',
      message:
        'La importación reemplazará la partida, la memoria, los tokens y los ajustes actuales, incluido el prompt. Si el archivo no trae API key, se conserva la tuya.',
      confirmLabel: 'Importar',
      danger: true,
    })
    if (result !== 'confirm') return
  }
  try {
    await importProgress(file)
    settingsOpen.value = false
    push(`Partida importada: ${messages.value.length} mensajes.`, { tone: 'success' })
  } catch (importError) {
    push(`No se pudo importar: ${(importError as Error)?.message ?? 'archivo inválido'}`, { tone: 'error' })
  }
}

async function onInstall() {
  await install()
}
</script>

<template>
  <AppDialog
    :open="settingsOpen"
    title="Ajustes"
    description="Conexión con el modelo, campaña, mundo, prompt, lectura y datos"
    variant="drawer"
    @close="close"
  >
    <template #icon>
      <SlidersHorizontal class="h-4 w-4" />
    </template>

    <template #toolbar>
      <div role="tablist" aria-label="Secciones de ajustes" class="flex gap-1 overflow-x-auto border-b border-divider px-3 py-2 sm:px-5">
        <button
          v-for="tab in tabs"
          :id="`tab-${tab.id}`"
          :key="tab.id"
          type="button"
          role="tab"
          :aria-selected="settingsTab === tab.id"
          :aria-controls="`panel-${tab.id}`"
          class="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition"
          :class="
            settingsTab === tab.id
              ? 'bg-surface-higher text-gold-bright shadow-[inset_0_0_0_1px_rgb(138_110_60/0.55)]'
              : 'text-muted hover:text-parchment'
          "
          @click="settingsTab = tab.id"
        >
          <component :is="tab.icon" class="h-3.5 w-3.5" />
          {{ tab.label }}
        </button>
      </div>
    </template>

    <!-- Conexión -->
    <section
      v-show="settingsTab === 'connection'"
      id="panel-connection"
      role="tabpanel"
      aria-labelledby="tab-connection"
      class="space-y-5"
    >
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
        <p v-if="providerHint" class="field-hint">{{ providerHint }}</p>
      </label>

      <label class="block">
        <span class="field-label">URL base</span>
        <input
          v-model="draft.baseUrl"
          class="field font-mono text-[12.5px] pointer-coarse:text-base"
          placeholder="https://api.openai.com/v1"
          spellcheck="false"
          autocomplete="off"
          @input="syncProviderId"
        >
        <p class="field-hint">
          Endpoint compatible con OpenAI; la app añade <code class="text-gold">/chat/completions</code>. Una
          URL directa necesita que el servidor permita CORS.
        </p>
        <p v-if="mixedContent" class="mt-1.5 text-xs leading-5 text-warning">
          Esta página usa HTTPS: el navegador bloqueará una URL http:// que no sea localhost.
        </p>
      </label>

      <label class="block">
        <span class="field-label">API key <span v-if="!keyRequired" class="normal-case">(opcional)</span></span>
        <div class="relative">
          <input
            v-model="draft.apiKey"
            :type="showKey ? 'text' : 'password'"
            class="field pr-11 font-mono text-[12.5px] pointer-coarse:text-base"
            placeholder="Pega la key del proveedor"
            autocomplete="off"
            spellcheck="false"
          >
          <button
            type="button"
            class="absolute inset-y-0 right-1 flex w-9 items-center justify-center text-faint hover:text-gold-bright"
            :aria-label="showKey ? 'Ocultar key' : 'Mostrar key'"
            @click="showKey = !showKey"
          >
            <EyeOff v-if="showKey" class="h-4 w-4" />
            <Eye v-else class="h-4 w-4" />
          </button>
        </div>
        <p class="field-hint">Se guarda solo en este navegador y viaja como cabecera Authorization.</p>
      </label>

      <label class="block">
        <span class="field-label">Modelo</span>
        <input v-model="draft.model" class="field font-mono text-[12.5px] pointer-coarse:text-base" placeholder="claude-haiku-5-5" spellcheck="false">
      </label>

      <div>
        <span class="field-label">Razonamiento</span>
        <div class="seg flex-wrap" role="group" aria-label="Nivel de razonamiento">
          <button
            v-for="level in REASONING_LEVELS"
            :key="level"
            type="button"
            class="seg-item"
            :aria-pressed="draft.reasoning === level"
            @click="draft.reasoning = level"
          >
            {{ level }}
          </button>
        </div>
        <p class="field-hint">Más razonamiento = respuestas más cuidadas pero más lentas. <strong class="text-gold">max</strong> puede tardar minutos.</p>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <label class="block">
          <span class="field-label">Ventana de contexto</span>
          <select v-model.number="draft.contextWindow" class="field">
            <option
              v-if="!CONTEXT_WINDOWS.some((item) => item.value === draft.contextWindow)"
              :value="draft.contextWindow"
            >
              {{ draft.contextWindow.toLocaleString('es') }} tokens
            </option>
            <option v-for="item in CONTEXT_WINDOWS" :key="item.value" :value="item.value">
              {{ item.label }} tokens
            </option>
          </select>
          <p class="field-hint">Si el historial no cabe, se omiten los mensajes más antiguos (la memoria se conserva).</p>
        </label>
        <div>
          <span class="field-label">Respuesta en tiempo real</span>
          <label class="flex cursor-pointer items-start gap-3 rounded-xl border border-divider bg-ink-soft px-3 py-2.5">
            <input v-model="draft.stream" type="checkbox" role="switch" class="mt-0.5 h-4 w-4 accent-[#d6b36a]">
            <span class="text-sm leading-5 text-parchment">
              Streaming
              <span class="block text-xs text-muted">Ves el texto mientras se escribe. Necesario en Vercel para respuestas largas.</span>
            </span>
          </label>
        </div>
      </div>

      <div class="rounded-xl border border-divider bg-surface-high/60 p-3">
        <div class="flex flex-wrap items-center gap-3">
          <button type="button" class="btn-secondary btn-sm" :disabled="testing" @click="runTest">
            <LoaderCircle v-if="testing" class="h-3.5 w-3.5 animate-spin" />
            <Plug v-else class="h-3.5 w-3.5" />
            Probar conexión
          </button>
          <p class="text-xs text-faint">Envía un mensaje mínimo con estos datos (consume pocos tokens).</p>
        </div>
        <p
          v-if="testResult"
          role="status"
          class="mt-3 flex items-start gap-2 text-xs leading-5"
          :class="testResult.ok ? 'text-success' : 'text-error'"
        >
          <CheckCircle2 v-if="testResult.ok" class="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <XCircle v-else class="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {{ testResult.message }}
        </p>
      </div>
    </section>

    <!-- Campaña -->
    <section
      v-show="settingsTab === 'campaign'"
      id="panel-campaign"
      role="tabpanel"
      aria-labelledby="tab-campaign"
      class="space-y-5"
    >
      <p class="rounded-xl border border-divider bg-surface-high/60 px-3 py-2.5 text-xs leading-5 text-muted">
        Los cambios se aplican desde el próximo turno. Para empezar de cero con otro personaje, usa
        «Nueva partida».
      </p>
      <label class="block">
        <span class="field-label">Tema</span>
        <input v-model="draft.theme" list="themes" class="field" placeholder="Alta Fantasía">
        <datalist id="themes"><option v-for="item in THEMES" :key="item" :value="item" /></datalist>
      </label>
      <label class="block">
        <span class="field-label">Mundo</span>
        <input v-model="draft.world" list="worlds" class="field" placeholder="Faerûn (Reinos Olvidados)">
        <datalist id="worlds"><option v-for="item in WORLDS" :key="item" :value="item" /></datalist>
      </label>
      <label class="block">
        <span class="field-label">Nombre del personaje</span>
        <input v-model="draft.character" class="field" placeholder="Sabrina">
      </label>
      <div class="grid gap-4 sm:grid-cols-2">
        <label class="block">
          <span class="field-label">Clase</span>
          <input v-model="draft.characterClass" list="classes" class="field" placeholder="Maga">
          <datalist id="classes"><option v-for="item in CLASSES" :key="item" :value="item" /></datalist>
        </label>
        <label class="block">
          <span class="field-label">Raza</span>
          <input v-model="draft.race" list="races" class="field" placeholder="Humana">
          <datalist id="races"><option v-for="item in RACES" :key="item" :value="item" /></datalist>
        </label>
      </div>
    </section>

    <!-- Mundo -->
    <section
      v-show="settingsTab === 'world'"
      id="panel-world"
      role="tabpanel"
      aria-labelledby="tab-world"
      class="space-y-5"
    >
      <div class="rounded-xl border border-divider bg-surface-high/60 px-3 py-2.5 text-xs leading-5 text-muted">
        Escribe aquí lo que el Dungeon Master debe saber de tu mundo: historia, lugares, facciones,
        personajes y reglas. Se añade al prompt como <strong class="text-parchment">canon</strong>, así
        una franquicia de videojuegos, cine o series se narra fiel al original.
        <strong class="text-parchment">Se aplica desde el próximo turno.</strong>
      </div>

      <label class="block">
        <span class="field-label">Mundo o franquicia</span>
        <input v-model="draft.world" list="worlds" class="field" placeholder="Faerûn (Reinos Olvidados)" :disabled="generating">
        <p class="field-hint">Es el mismo campo de la pestaña Campaña. El modelo lo usa para generar el contexto.</p>
      </label>

      <div>
        <div class="mb-1.5 flex items-center justify-between gap-2">
          <label for="lore-text" class="field-label !mb-0">Contexto del mundo</label>
          <span
            class="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            :class="
              draft.lore.trim()
                ? 'border-gold-dim bg-gold/10 text-gold-bright'
                : 'border-divider bg-surface-high text-muted'
            "
          >
            {{ draft.lore.trim() ? 'Activo' : 'Vacío' }}
          </span>
        </div>
        <textarea
          id="lore-text"
          v-model="draft.lore"
          class="field min-h-[190px] resize-y sm:min-h-[300px] text-[13px] leading-6 pointer-coarse:text-base"
          placeholder="Ej.: Estamos en el Continente poco después de la Tercera Guerra del Norte… (o pulsa «Generar de cero»)."
          :maxlength="MAX_LORE_CHARS"
          :readonly="generating"
          :aria-busy="generating"
          spellcheck="true"
        />
        <div class="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs tabular-nums text-faint">
          <span>{{ formatNumber(draft.lore.length) }} / {{ formatNumber(MAX_LORE_CHARS) }} caracteres</span>
          <span :class="loreTooBig ? 'text-warning' : ''">
            ~{{ formatNumber(loreTokenCount) }} tokens por turno
          </span>
        </div>
        <p v-if="loreTooBig" role="status" class="mt-1.5 text-xs leading-5 text-warning">
          Ocupa más del {{ Math.round(LORE_WARN_RATIO * 100) }}% de la ventana de contexto: quedará menos
          espacio para el historial. Resúmelo o sube la ventana en Conexión.
        </p>
        <p v-else class="field-hint">
          Va en cada petición, antes de la memoria. Cuanto más breve y concreto, mejor y más barato.
        </p>
      </div>

      <div>
        <span class="field-label">Esfuerzo del modelo</span>
        <div class="seg flex-wrap" role="group" aria-label="Esfuerzo de razonamiento para el contexto del mundo">
          <button
            v-for="level in REASONING_LEVELS"
            :key="level"
            type="button"
            class="seg-item"
            :disabled="generating"
            :aria-pressed="draft.loreReasoning === level"
            @click="draft.loreReasoning = level"
          >
            {{ level }}
          </button>
        </div>
        <p class="field-hint">
          Se usa al <strong class="text-parchment">generar de cero</strong> y al
          <strong class="text-parchment">aplicar la plantilla</strong>; no cambia el razonamiento de la
          partida. <strong class="text-gold">medium</strong> basta casi siempre; sube el esfuerzo con
          textos muy largos o franquicias poco conocidas.
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <template v-if="!generating">
          <button
            type="button"
            :class="hasLore ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'"
            :title="hasLore ? 'El modelo reorganiza tu texto con las secciones del dossier' : 'Inserta el esqueleto de la plantilla para rellenarlo a mano'"
            @click="applyTemplate"
          >
            <LayoutTemplate class="h-3.5 w-3.5" />
            Aplicar plantilla
          </button>
          <button
            type="button"
            :class="hasLore ? 'btn-secondary btn-sm' : 'btn-primary btn-sm'"
            title="El modelo escribe el contexto a partir del mundo y el tema"
            @click="generateLoreText"
          >
            <WandSparkles class="h-3.5 w-3.5" />
            Generar de cero
          </button>
        </template>
        <button v-else type="button" class="btn-secondary btn-sm" @click="stopLoreGeneration">
          <Square class="h-3 w-3 fill-current" />
          Detener
        </button>
        <button type="button" class="btn-secondary btn-sm" :disabled="generating" @click="loreFile?.click()">
          <FileUp class="h-3.5 w-3.5" />
          Importar texto
        </button>
        <button
          type="button"
          class="btn-ghost btn-sm"
          :disabled="generating || !draft.lore"
          @click="clearLore"
        >
          <RotateCcw class="h-3.5 w-3.5" />
          Vaciar
        </button>
        <input
          ref="loreFile"
          type="file"
          accept=".txt,.md,.markdown,text/plain,text/markdown"
          class="hidden"
          @change="onLoreFile"
        >
      </div>
      <p v-if="hasLore" class="field-hint !mt-2">
        <strong class="text-parchment">Aplicar plantilla</strong> reorganiza tu texto con el modelo en las
        secciones del dossier: conserva sus datos, no inventa nada y quita el ruido de la web (menús,
        referencias, avisos). <strong class="text-parchment">Generar de cero</strong> lo reemplaza por un
        resumen que escribe el modelo. Ambas se pueden deshacer.
      </p>
      <p v-else class="field-hint !mt-2">
        Pega un texto de la franquicia (por ejemplo de una wiki) y pulsa
        <strong class="text-parchment">Aplicar plantilla</strong>, o deja que el modelo lo escriba con
        <strong class="text-parchment">Generar de cero</strong> (puede equivocarse: revísalo). Con el
        editor vacío, «Aplicar plantilla» inserta el esqueleto para rellenarlo a mano.
      </p>

      <div class="rounded-xl border border-divider bg-ink-soft px-3 py-2.5">
        <p class="field-label">Qué conviene incluir</p>
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="idea in LORE_IDEAS"
            :key="idea"
            class="rounded-md border border-divider bg-surface-high px-1.5 py-0.5 text-[11px] text-muted"
          >{{ idea }}</span>
        </div>
        <p class="field-hint">
          También puedes pegar texto de una wiki de la franquicia. No pongas instrucciones de formato:
          el contexto es material de consulta y no cambia las reglas del DM.
        </p>
      </div>
    </section>

    <!-- Prompt -->
    <section
      v-show="settingsTab === 'prompt'"
      id="panel-prompt"
      role="tabpanel"
      aria-labelledby="tab-prompt"
      class="space-y-5"
    >
      <div class="rounded-xl border border-divider bg-surface-high/60 px-3 py-2.5 text-xs leading-5 text-muted">
        El prompt define el rol, el tono y las reglas del Dungeon Master. Si dejas el campo vacío,
        se usa el prompt original.
        <strong class="text-parchment">Los cambios se aplican desde el próximo turno.</strong>
      </div>

      <div>
        <div class="mb-1.5 flex items-center justify-between gap-2">
          <span class="field-label !mb-0">Prompt del Dungeon Master</span>
          <span
            class="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            :class="
              customPromptActive
                ? 'border-gold-dim bg-gold/10 text-gold-bright'
                : 'border-divider bg-surface-high text-muted'
            "
          >
            {{ customPromptActive ? 'Personalizado' : 'Original' }}
          </span>
        </div>
        <textarea
          v-model="draft.customPrompt"
          class="field min-h-[320px] resize-y font-mono text-[12px] leading-5 pointer-coarse:text-base"
          placeholder="Deja el campo vacío para usar el prompt original, o pulsa «Cargar prompt original» para editarlo."
          spellcheck="false"
          maxlength="100000"
          aria-label="Prompt personalizado del Dungeon Master"
        />
        <p class="field-hint">
          El prompt personalizado reemplaza al original. La app añade siempre el contexto del
          mundo, la memoria de la partida y el recordatorio de cierre.
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button type="button" class="btn-secondary btn-sm" @click="loadBasePrompt">
          <FileText class="h-3.5 w-3.5" />
          Cargar prompt original
        </button>
        <button
          type="button"
          class="btn-ghost btn-sm"
          :disabled="!draft.customPrompt"
          @click="resetPrompt"
        >
          <RotateCcw class="h-3.5 w-3.5" />
          Usar el original
        </button>
        <span class="ml-auto text-xs tabular-nums text-faint">
          {{ draft.customPrompt.length.toLocaleString('es') }} caracteres
        </span>
      </div>

      <div class="rounded-xl border border-divider bg-ink-soft px-3 py-2.5">
        <p class="field-label">Marcadores disponibles</p>
        <div class="flex flex-wrap gap-1.5">
          <code
            v-for="marker in PROMPT_MARKERS"
            :key="marker"
            class="rounded-md border border-divider bg-surface-high px-1.5 py-0.5 font-mono text-[11px] text-gold"
          >{{ marker }}</code>
        </div>
        <p class="field-hint">
          Se sustituyen al enviar el prompt. Mantén el contrato de la app
          (<code class="text-gold">[ESTADO]</code>, cinco opciones y
          <code class="text-gold">[TIRADA]</code>) para que la memoria, los botones y los dados
          sigan funcionando.
        </p>
      </div>
    </section>

    <!-- Lectura y voz -->
    <section
      v-show="settingsTab === 'reading'"
      id="panel-reading"
      role="tabpanel"
      aria-labelledby="tab-reading"
      class="space-y-5"
    >
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <span class="field-label">Tamaño del texto</span>
          <div class="seg" role="group" aria-label="Tamaño del texto">
            <button type="button" class="seg-item" :aria-pressed="draft.textSize === 'sm'" @click="draft.textSize = 'sm'">Pequeño</button>
            <button type="button" class="seg-item" :aria-pressed="draft.textSize === 'md'" @click="draft.textSize = 'md'">Normal</button>
            <button type="button" class="seg-item" :aria-pressed="draft.textSize === 'lg'" @click="draft.textSize = 'lg'">Grande</button>
          </div>
        </div>
        <div>
          <span class="field-label">Letra de la narración</span>
          <div class="seg" role="group" aria-label="Letra de la narración">
            <button type="button" class="seg-item font-serif" :aria-pressed="draft.readingFont === 'serif'" @click="draft.readingFont = 'serif'">Libro</button>
            <button type="button" class="seg-item" :aria-pressed="draft.readingFont === 'sans'" @click="draft.readingFont = 'sans'">Moderna</button>
          </div>
        </div>
      </div>

      <div
        class="rounded-xl border border-divider bg-surface px-4 py-3"
        :data-preview-font="draft.readingFont"
      >
        <p
          class="text-parchment"
          :style="{
            fontFamily: draft.readingFont === 'serif' ? 'var(--font-serif)' : 'var(--font-sans)',
            fontSize: draft.textSize === 'sm' ? '15.5px' : draft.textSize === 'lg' ? '19.5px' : '17px',
            lineHeight: 1.7,
          }"
        >
          La lluvia golpea los ventanales de <strong class="text-gold-bright">El Portal Bostezante</strong>
          mientras un bardo desafina en un rincón.
        </p>
      </div>

      <div class="h-px bg-divider" />

      <div>
        <div class="flex items-center justify-between gap-2">
          <span class="field-label !mb-0">Voz del narrador</span>
          <button type="button" class="btn-ghost btn-sm" @click="refreshBrowserVoices">
            <RefreshCw class="h-3.5 w-3.5" />
            Actualizar
          </button>
        </div>
        <div class="mt-2 flex gap-2">
          <select v-model="draft.browserVoice" class="field" aria-label="Voz del navegador">
            <option value="">Automática (mejor voz en español)</option>
            <option v-for="voice in browserVoices" :key="voice.voiceURI" :value="voice.voiceURI">
              {{ voice.name }} · {{ voice.lang }}
            </option>
          </select>
          <button
            type="button"
            class="btn-secondary shrink-0"
            @click="previewVoice(draft.browserVoice, draft.speechRate)"
          >
            <Volume2 class="h-4 w-4" />
            Probar
          </button>
        </div>
        <p class="field-hint">Usa las voces instaladas en el sistema. Las voces «Natural» u «Online» suenan mejor.</p>
      </div>

      <label class="block">
        <span class="field-label flex justify-between">
          Velocidad de lectura
          <span class="font-mono normal-case text-parchment">{{ draft.speechRate.toFixed(2) }}×</span>
        </span>
        <input
          v-model.number="draft.speechRate"
          type="range"
          min="0.7"
          max="1.5"
          step="0.05"
          class="w-full accent-[#d6b36a]"
        >
      </label>

      <label class="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-divider bg-ink-soft px-3 py-2.5 text-sm text-parchment">
        Leer automáticamente cada respuesta del DM
        <input v-model="draft.autoRead" type="checkbox" role="switch" class="h-4 w-4 accent-[#d6b36a]">
      </label>

      <label class="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-divider bg-ink-soft px-3 py-2.5 text-sm text-parchment">
        <span>
          Mostrar la trama secreta del DM
          <span class="block text-xs text-muted">Revela en el panel la sección «Trama (solo DM)». Contiene spoilers.</span>
        </span>
        <input v-model="draft.showSecrets" type="checkbox" role="switch" class="h-4 w-4 accent-[#b79cff]">
      </label>
    </section>

    <!-- Datos -->
    <section
      v-show="settingsTab === 'data'"
      id="panel-data"
      role="tabpanel"
      aria-labelledby="tab-data"
      class="space-y-5"
    >
      <div class="card p-4">
        <p class="text-sm font-medium text-parchment">Copia de seguridad</p>
        <p class="mt-1 text-xs leading-5 text-muted">
          Un archivo JSON con el historial, la memoria, los dados, los tokens y los ajustes, incluido
          el prompt personalizado. Úsalo para continuar en otro dispositivo o navegador.
        </p>
        <label class="mt-3 flex cursor-pointer items-center gap-2 text-xs text-muted">
          <input v-model="includeKey" type="checkbox" class="h-4 w-4 accent-[#d6b36a]">
          Incluir la API key (texto plano; no compartas el archivo)
        </label>
        <div class="mt-3 flex flex-wrap gap-2">
          <button type="button" class="btn-secondary flex-1" :disabled="loading" @click="onExport">
            <Download class="h-4 w-4" />
            Exportar partida
          </button>
          <button type="button" class="btn-ghost flex-1" :disabled="loading" @click="onImportClick">
            <Upload class="h-4 w-4" />
            Importar partida
          </button>
        </div>
        <input
          ref="importInput"
          type="file"
          accept="application/json,.json"
          class="hidden"
          @change="onImportChange"
        >
      </div>

      <div class="card p-4">
        <p class="text-sm font-medium text-parchment">Almacenamiento</p>
        <p class="mt-1 text-xs leading-5 text-muted">
          La partida se guarda automáticamente en este navegador (IndexedDB). Ocupa
          <strong class="text-parchment">{{ formatBytes(usedBytes) }}</strong>
          <template v-if="quotaBytes">{{ ' ' }}de unos {{ formatBytes(quotaBytes) }} que el navegador concede a esta app</template>.
          Exportar la partida sigue siendo la mejor copia de seguridad.
        </p>
        <div v-if="quotaBytes" class="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-soft">
          <div
            class="h-full rounded-full"
            :class="usedShare > 0.9 ? 'bg-error' : usedShare > 0.7 ? 'bg-warning' : 'bg-gold'"
            :style="{ width: `${Math.max(1, Math.min(100, usedShare * 100))}%` }"
          />
        </div>
      </div>

      <div class="card p-4">
        <p class="flex items-center gap-2 text-sm font-medium text-parchment">
          <Smartphone class="h-4 w-4 text-gold" />
          Aplicación
        </p>
        <p class="mt-1 text-xs leading-5 text-muted">
          <template v-if="installed">Dungeon AI ya está instalada en este dispositivo.</template>
          <template v-else>
            Instálala para abrirla en su propia ventana, desde el escritorio o la pantalla de inicio, incluso
            sin conexión (necesitas red solo para hablar con el modelo).
          </template>
        </p>
        <button v-if="canInstall" type="button" class="btn-secondary btn-sm mt-3" @click="onInstall">
          <Download class="h-3.5 w-3.5" />
          Instalar Dungeon AI
        </button>
        <p v-else-if="!installed" class="mt-2 text-xs text-faint">
          En iPhone/iPad: Compartir → «Añadir a pantalla de inicio».
        </p>
      </div>
    </section>

    <p v-if="error" role="alert" class="mt-5 rounded-xl border border-error/40 bg-error/10 px-3 py-2 text-sm text-error">
      {{ error }}
    </p>

    <template #footer>
      <span v-if="dirty" class="mr-auto text-xs text-faint">Cambios sin guardar</span>
      <button type="button" class="btn-ghost" @click="close">Cancelar</button>
      <button type="button" class="btn-primary" :disabled="!dirty" @click="save">Guardar</button>
    </template>
  </AppDialog>
</template>
