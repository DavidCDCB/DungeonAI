import { computed, reactive, ref, shallowRef, watch } from 'vue'
import type {
  ChatMessage,
  DiceGroup,
  DiceRequest,
  DiceRoll,
  Reasoning,
  Settings,
  TokenUsage,
  TurnPhase,
} from '../types'
import { DEFAULT_SETTINGS } from '../types'
import {
  ApiError,
  CancelledError,
  chatWithFallback,
  requestMemoryUpdate,
  requestOptions,
  type StreamProgress,
} from '../lib/api'
import { messageFor, rollRequest, suggestDice, toGroup } from '../lib/dice'
import { hasFullState, memoryAfter, mergeState, parseStateReply } from '../lib/gameState'
import {
  createMessage,
  newMessageId,
  attachOptions,
  streamingPreview,
} from '../lib/messages'
import {
  INSTRUCCION_ESTADO,
  INSTRUCCION_OPCIONES,
  buildOptionsPrompt,
  buildStatePrompt,
  buildSystemPrompt,
} from '../lib/prompt'
import { requiresApiKey } from '../lib/providers'
import { withRetries } from '../lib/retry'
import { isContextError } from '../lib/sse'
import {
  cloudConfigured,
  cloudTransport,
  isValidSyncCode,
  newSyncCode,
  normalizeSyncCode,
  readCloudSnapshot,
  watchCloudSnapshot,
  writeCloudSnapshot,
} from '../lib/cloud'
import {
  downloadProgress,
  parseProgressFile,
  serializeProgress,
  type ProgressFile,
} from '../lib/transfer'
import { chunkForSpeech, cleanForSpeech } from '../lib/ttsText'
import { estimateOffset, spokenWords, wordIndexAt } from '../lib/speechHighlight'
import { formatTokens } from '../lib/format'
import { charsToTokens } from '../lib/contextBudget'
import { createPaceMeter } from '../lib/pace'
import {
  clearDiceGroups,
  clearGameStorage,
  loadCloudSettings,
  loadDiceGroups,
  loadDraft,
  loadMessages,
  loadSettings,
  loadState,
  loadUsage,
  saveCloudSettings,
  saveDiceGroups,
  saveDraft,
  saveMessages,
  saveSettings,
  saveState,
  saveUsage,
} from '../lib/storage'
import { useConfirm } from './useConfirm'
import { useToasts } from './useToasts'

export type SettingsTab = 'connection' | 'campaign' | 'world' | 'prompt' | 'reading' | 'data'

const { push: toast } = useToasts()
const { ask: confirmAction } = useConfirm()

const settings = reactive<Settings>(loadSettings(DEFAULT_SETTINGS))
const messages = ref<ChatMessage[]>(loadMessages())
const gameState = ref(loadState())
const usage = ref<TokenUsage | null>(loadUsage())

const loading = ref(false)
const phase = ref<TurnPhase>('idle')
/**
 * Segunda llamada del turno: genera las opciones mientras el jugador lee o escucha la
 * narración. `loading` ya es false (el jugador puede actuar); esto solo marca que faltan.
 */
const optionsPending = ref(false)
/**
 * Cronista de estado: tras cada narración actualiza la memoria en segundo plano. El siguiente
 * turno del DM espera a que termine (necesita la memoria al día).
 */
const memoryPending = ref(false)
/** Intento en curso de los agentes en segundo plano (1 = el primero; se reintentan solos). */
const agentAttempt = ref(1)
/** Final del razonamiento recibido: solo alimenta el fondo difuminado de la espera. */
const reasoningTail = ref('')
let tailStampedAt = 0
const turnStartedAt = ref(0)
const pendingId = ref<string | null>(null)
const streamText = ref('')
const reasoningChars = ref(0)
/** Reloj del turno (cada 250 ms) y marcas de tiempo para medir la velocidad. */
const now = ref(Date.now())
const reasoningStartedAt = ref(0)
const reasoningEndedAt = ref(0)
const contentStartedAt = ref(0)
const draft = ref(loadDraft())
const errorMessage = ref('')
const errorKind = ref<'error' | 'cancelled'>('error')
const storageFailed = ref(false)
const announcement = ref('')

// Nube (Firebase RTDB): la partida local sigue siendo la fuente; la nube es un espejo.
const cloudEnabled = ref(false)
const cloudCode = ref('')
const cloudStatus = ref<'disabled' | 'loading' | 'saving' | 'saved' | 'error'>('disabled')
const cloudError = ref('')
const cloudLastSaved = ref<number | null>(null)
const cloudRemoteAt = ref<number | null>(null)
const cloudBusy = ref(false)
/** Camino que usa la nube: el SDK (WebSocket) o, si la red lo bloquea, la API REST por HTTPS. */
const cloudVia = ref<'sdk' | 'rest'>('sdk')

const settingsOpen = ref(false)
const settingsTab = ref<SettingsTab>('connection')
const diceOpen = ref(false)
const diceResults = ref<DiceRoll[] | null>(null)
const contextOpen = ref(false)
const memoryOpen = ref(false)
const panelOpen = ref(false)

const defaultDice = (): DiceGroup[] => [{ die: 'd20', count: '1', bonus: '0' }]
const diceGroups = ref<DiceGroup[]>(loadDiceGroups() ?? defaultDice())

const scrollTarget = ref<string | null>(null)
const scrollNonce = ref(0)
const streamNonce = ref(0)
const composerFocusNonce = ref(0)

const browserVoices = ref<SpeechSynthesisVoice[]>([])
const speakingId = ref<string | null>(null)
const ttsPaused = ref(false)
/** Palabras del texto que se está leyendo y cuál suena ahora (-1 = ninguna). */
const speechWords = shallowRef<string[]>([])
const speechWordIndex = ref(-1)
const ttsError = ref('')

let abortController: AbortController | null = null
let speechToken = 0
let optionsController: AbortController | null = null
let memoryController: AbortController | null = null
let memoryTarget: string | null = null
let memoryTask: Promise<void> | null = null
let optionsFor: string | null = null
let initialized = false
let clock: ReturnType<typeof setInterval> | null = null
let draftTimer: ReturnType<typeof setTimeout> | null = null
let pendingProgress: StreamProgress | null = null
let progressFrame = 0

let cloudInitialized = false
let cloudReady = false
let cloudTimer: ReturnType<typeof setTimeout> | null = null
let cloudUnsubscribe: (() => void) | null = null
let cloudSaving = false
let cloudWatchVia: 'sdk' | 'rest' | null = null
let cloudDirty = false
let cloudApplying = false
let cloudLocalWriteAt = 0
let cloudNotifiedAt = 0

// ---------------------------------------------------------------------------
// Derivados
// ---------------------------------------------------------------------------

const lastMessage = computed(() => messages.value[messages.value.length - 1])

const lastAssistant = computed(() =>
  [...messages.value].reverse().find((message) => message.role === 'assistant'),
)

const diceRequested = computed(() => {
  const last = lastMessage.value
  return Boolean(last && last.role === 'assistant' && last.diceRequest)
})

const diceSuggestions = computed(() =>
  diceRequested.value && lastMessage.value ? suggestDice(lastMessage.value.display) : [],
)

const visibleOptions = computed(() => {
  const last = lastMessage.value
  if (loading.value || !last || last.role !== 'assistant' || last.diceRequest) return []
  return last.options
})

/** La última respuesta del DM debería tener opciones y no las tiene (falló la llamada o es una partida antigua). */
const optionsMissing = computed(() => {
  const last = lastMessage.value
  return Boolean(
    !loading.value &&
      !optionsPending.value &&
      !memoryPending.value &&
      last &&
      last.role === 'assistant' &&
      !last.diceRequest &&
      !last.options.length &&
      last.display.trim(),
  )
})

const hasMessages = computed(() => messages.value.length > 0)
const awaitingReply = computed(
  () => !loading.value && lastMessage.value?.role === 'user',
)

const configured = computed(
  () => !requiresApiKey(settings.baseUrl) || Boolean(settings.apiKey.trim()),
)

/** Mensaje provisional del DM mientras escribe (mismo id que tendrá el definitivo). */
const streamingMessage = computed<ChatMessage | null>(() => {
  if (!loading.value || !pendingId.value) return null
  return createMessage('assistant', streamingPreview(streamText.value), pendingId.value)
})

const displayMessages = computed(() =>
  streamingMessage.value ? [...messages.value, streamingMessage.value] : messages.value,
)

export interface LiveStats {
  reasoningTokens: number
  contentTokens: number
  /** tok/s medios del razonamiento (se congela cuando empieza el texto). */
  reasoningRate: number | null
  /**
   * tok/s *actuales* del razonamiento (ventana de unos 2,5 s): sube y baja con el ritmo
   * real. 0 si se detuvo, null si aún no hay datos o el razonamiento ya terminó.
   */
  reasoningSpeed: number | null
  /** tok/s del texto visible. */
  contentRate: number | null
}

function rate(tokens: number, start: number, end: number): number | null {
  if (!start || tokens <= 0) return null
  const seconds = (end - start) / 1000
  return seconds >= 0.5 ? tokens / seconds : null
}

/** Conteo y velocidad estimados mientras llegan los tokens. */
const reasoningPace = createPaceMeter()

const liveStats = computed<LiveStats>(() => {
  const reasoningTokens = charsToTokens(reasoningChars.value)
  const contentTokens = charsToTokens(streamText.value.length)
  const reasoning = reasoningTokens > 0 && !contentStartedAt.value
  return {
    reasoningTokens,
    contentTokens,
    reasoningSpeed: reasoning ? reasoningPace.rate(now.value) : null,
    reasoningRate: rate(reasoningTokens, reasoningStartedAt.value, reasoningEndedAt.value || now.value),
    contentRate: rate(contentTokens, contentStartedAt.value, now.value),
  }
})

const contextTokens = computed(() => usage.value?.total ?? 0)
const reasoningTokens = computed(() => usage.value?.reasoning ?? 0)

// Si la última respuesta cambia (otra acción, regenerar, deshacer, partida nueva), las opciones
// que se estaban generando para la anterior ya no sirven.
watch(
  () => lastMessage.value?.id,
  (id) => {
    if (optionsPending.value && id !== optionsFor) cancelOptions()
    if (memoryTarget && !messages.value.some((message) => message.id === memoryTarget)) cancelMemory()
  },
)

watch(draft, (value) => {
  if (draftTimer) clearTimeout(draftTimer)
  draftTimer = setTimeout(() => {
    draftTimer = null
    track(saveDraft(value))
  }, 300)
})

// Al cerrar o cambiar de app, guarda al instante el borrador que aún esperaba su turno.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    if (draftTimer) {
      clearTimeout(draftTimer)
      draftTimer = null
      track(saveDraft(draft.value))
    }
    void flushCloudSave()
  })
}

// La pestaña en segundo plano también intenta confirmar la última copia en la nube.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushCloudSave()
  })
}

// ---------------------------------------------------------------------------
// Persistencia
// ---------------------------------------------------------------------------

function reportStorage(ok: boolean) {
  if (ok) {
    storageFailed.value = false
    return
  }
  if (!storageFailed.value) {
    toast('No se pudo guardar la partida: el almacenamiento del navegador está lleno o bloqueado. Exporta tu progreso.', {
      tone: 'error',
      timeout: 0,
      action: { label: 'Exportar', run: () => exportProgress() },
    })
  }
  storageFailed.value = true
}

/** Las escrituras a IndexedDB son asíncronas: el aviso de error llega al confirmarse el lote. */
function track(write: Promise<boolean>) {
  void write.then(reportStorage)
}

function persistMessages() {
  track(saveMessages(messages.value))
  scheduleCloudSave()
}

function persistGame() {
  track(
    Promise.all([saveMessages(messages.value), saveState(gameState.value), saveUsage(usage.value)]).then(
      (results) => results.every(Boolean),
    ),
  )
  scheduleCloudSave()
}

function persistSettings() {
  track(saveSettings(settings))
  scheduleCloudSave()
}

// ---------------------------------------------------------------------------
// Utilidades de UI
// ---------------------------------------------------------------------------

function requestScroll(target: string) {
  scrollTarget.value = target
  scrollNonce.value++
}

function focusComposer() {
  composerFocusNonce.value++
}

function announce(text: string) {
  announcement.value = ''
  setTimeout(() => {
    announcement.value = text
  }, 50)
}

function openSettings(tab: SettingsTab = 'connection') {
  settingsTab.value = tab
  settingsOpen.value = true
}

function ensureConfigured(): boolean {
  if (configured.value) return true
  openSettings('connection')
  toast('Conecta un proveedor del modelo para jugar.', { tone: 'warning' })
  return false
}

/** Prompt del Arquitecto de Opciones, con la memoria ya actualizada con el último turno. */
function optionsSystemPrompt(): string {
  return buildOptionsPrompt(settings, gameState.value)
}

function systemPrompt(): string {
  return buildSystemPrompt(settings, gameState.value)
}

// ---------------------------------------------------------------------------
// Nube (Firebase Realtime Database)
// ---------------------------------------------------------------------------

function cloudErrorMessage(error: unknown): string {
  const text = (error as Error)?.message ?? ''
  console.error('Firebase sync error:', error)
  if (/permission|denied/i.test(text)) {
    return 'Firebase rechazó el acceso. Revisa las reglas de Realtime Database.'
  }
  if (/network|offline|unavailable|failed to get/i.test(text)) {
    return 'No se pudo conectar con Firebase. Revisa tu red, el bloqueador de anuncios o el DNS privado del móvil. Se reintentará al guardar.'
  }
  if (/service database is not available/i.test(text)) {
    return 'Firebase no pudo inicializar Realtime Database. Revisa la configuración del proyecto.'
  }
  if (/config|api key|database url/i.test(text)) {
    return 'Faltan las variables VITE_FIREBASE_* en este despliegue.'
  }
  return 'No se pudo sincronizar con la nube. Revisa la configuración y las reglas.'
}

/** Si el SDK dejó de funcionar y seguimos por HTTPS, la escucha de cambios pasa a consultas periódicas. */
function syncCloudTransport() {
  cloudVia.value = cloudTransport()
  if (cloudEnabled.value && cloudCode.value && cloudWatchVia !== null && cloudWatchVia !== cloudVia.value) {
    void subscribeCloud(cloudCode.value)
  }
}

function cloudProgress(): ProgressFile {
  return serializeProgress(settings, messages.value, gameState.value, usage.value, diceGroups.value, {
    includeApiKey: false,
  })
}

function scheduleCloudSave(immediate = false) {
  if (!cloudReady || !cloudEnabled.value || !cloudCode.value || cloudApplying) return
  if (cloudTimer) {
    clearTimeout(cloudTimer)
    cloudTimer = null
  }
  if (immediate) {
    void flushCloudSave()
    return
  }
  cloudTimer = setTimeout(() => {
    cloudTimer = null
    void flushCloudSave()
  }, 1_200)
}

async function flushCloudSave(): Promise<boolean> {
  if (!cloudReady || !cloudEnabled.value || !cloudCode.value) return false
  if (cloudSaving) {
    cloudDirty = true
    return false
  }
  cloudSaving = true
  cloudStatus.value = 'saving'
  try {
    cloudLocalWriteAt = Date.now()
    const updatedAt = await writeCloudSnapshot(cloudCode.value, cloudProgress())
    cloudLocalWriteAt = updatedAt
    cloudLastSaved.value = updatedAt
    cloudRemoteAt.value = null
    cloudStatus.value = 'saved'
    cloudError.value = ''
    return true
  } catch (error) {
    cloudStatus.value = 'error'
    cloudError.value = cloudErrorMessage(error)
    return false
  } finally {
    cloudSaving = false
    syncCloudTransport()
    if (cloudDirty) {
      cloudDirty = false
      void flushCloudSave()
    }
  }
}

async function subscribeCloud(code: string) {
  cloudUnsubscribe?.()
  cloudUnsubscribe = null
  cloudWatchVia = cloudTransport()
  try {
    cloudUnsubscribe = await watchCloudSnapshot(code, {
      onSnapshot: (snapshot) => {
        if (!snapshot || cloudApplying) return
        const known = Math.max(cloudLastSaved.value ?? 0, cloudLocalWriteAt)
        if (cloudSaving || snapshot.updatedAt <= known || snapshot.updatedAt <= cloudNotifiedAt) return
        cloudNotifiedAt = snapshot.updatedAt
        cloudRemoteAt.value = snapshot.updatedAt
        toast('Hay una versión nueva de la partida en la nube.', {
          tone: 'info',
          action: {
            label: 'Cargar',
            run: () => {
              void restoreFromCloud(true)
            },
          },
        })
      },
      onError: (error) => {
        cloudStatus.value = 'error'
        cloudError.value = cloudErrorMessage(error)
      },
    })
  } catch (error) {
    cloudStatus.value = 'error'
    cloudError.value = cloudErrorMessage(error)
  }
}

function applyCloudProgress(progress: ProgressFile) {
  cloudApplying = true
  try {
    // La nube nunca debe introducir una API key, aunque alguien haya editado el nodo.
    applyProgressData({
      ...progress,
      settings: { ...progress.settings, apiKey: '' },
    })
  } finally {
    cloudApplying = false
  }
}

async function initCloud() {
  if (cloudInitialized) return
  cloudInitialized = true
  const stored = loadCloudSettings()
  cloudCode.value = stored.code
  cloudEnabled.value = Boolean(
    cloudConfigured && stored.enabled && isValidSyncCode(stored.code),
  )
  if (!cloudEnabled.value) {
    cloudStatus.value = 'disabled'
    return
  }
  cloudStatus.value = 'loading'
  cloudBusy.value = true
  cloudReady = true
  let connected = false
  let needsFirstSave = false
  try {
    const remote = await readCloudSnapshot(stored.code)
    if (remote) {
      if (!messages.value.length) {
        applyCloudProgress(remote.progress)
        cloudLastSaved.value = remote.updatedAt
        cloudStatus.value = 'saved'
      } else {
        cloudLastSaved.value = Math.max(remote.updatedAt, cloudLastSaved.value ?? 0)
        cloudRemoteAt.value = remote.updatedAt
        cloudStatus.value = 'saved'
        toast('Hay una partida guardada en la nube.', {
          tone: 'info',
          action: {
            label: 'Restaurar',
            run: () => {
              void restoreFromCloud(true)
            },
          },
        })
      }
    } else {
      cloudStatus.value = 'saved'
      needsFirstSave = true
    }
    connected = true
  } catch (error) {
    cloudStatus.value = 'error'
    cloudError.value = cloudErrorMessage(error)
  } finally {
    // «Conectando…» solo dura mientras se lee; el guardado inicial y la suscripción tienen su propio estado.
    cloudBusy.value = false
    cloudVia.value = cloudTransport()
  }
  if (!connected) return
  if (needsFirstSave) await flushCloudSave()
  await subscribeCloud(stored.code)
}

/**
 * Tras un fallo de conexión, vuelve a intentarlo al recuperar la red o al volver a la pestaña
 * (sin esperar a que el jugador pulse nada).
 */
function reconnectCloud() {
  if (!cloudEnabled.value || cloudBusy.value || cloudStatus.value !== 'error') return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  cloudInitialized = false
  void initCloud()
}

/**
 * Activa la nube con un código existente o genera uno nuevo.
 * Si la nube ya tiene partida y este navegador también, se pregunta antes de pisar.
 */
async function enableCloud(input = ''): Promise<boolean> {
  if (!cloudConfigured) {
    toast('Firebase no está configurado en este despliegue.', { tone: 'warning' })
    return false
  }
  if (loading.value) {
    toast('Espera a que termine el turno antes de activar la nube.', { tone: 'warning' })
    return false
  }
  if (cloudEnabled.value) return true
  cloudNotifiedAt = 0
  cloudLocalWriteAt = 0
  const provided = input.trim()
  let code: string
  try {
    code = provided ? normalizeSyncCode(provided) : newSyncCode()
  } catch (error) {
    toast((error as Error)?.message ?? 'No se pudo generar el código.', { tone: 'error' })
    return false
  }
  if (!isValidSyncCode(code)) {
    toast('El código debe tener 32 caracteres hexadecimales (0-9, a-f).', { tone: 'error' })
    return false
  }
  cloudBusy.value = true
  try {
    const hadLocal = messages.value.length > 0
    const remote = provided ? await readCloudSnapshot(code) : null
    let loadedRemote = false
    if (remote) {
      if (!hadLocal) {
        applyCloudProgress(remote.progress)
        loadedRemote = true
      } else {
        const result = await confirmAction({
          title: 'Hay una partida en la nube',
          message:
            'Este código ya tiene una partida. ¿Quieres cargarla y reemplazar la de este navegador? Si eliges mantener la local, la nube se sobrescribirá con tu partida actual.',
          confirmLabel: 'Cargar de la nube',
          cancelLabel: 'Mantener la local',
        })
        if (result === 'confirm') {
          applyCloudProgress(remote.progress)
          loadedRemote = true
        }
      }
    }
    cloudEnabled.value = true
    cloudCode.value = code
    cloudReady = true
    await saveCloudSettings({ enabled: true, code })
    if (loadedRemote) {
      cloudLastSaved.value = remote?.updatedAt ?? 0
      cloudRemoteAt.value = null
      cloudStatus.value = 'saved'
    } else {
      // El primer guardado se muestra como «Guardando…» y no deja los botones bloqueados.
      cloudBusy.value = false
      await flushCloudSave()
      if (!cloudEnabled.value) return false // el jugador desconectó mientras tanto
    }
    await subscribeCloud(code)
    const failed = cloudStatus.value === 'error'
    if (!failed) cloudError.value = ''
    toast(
      failed
        ? 'Nube activada, pero aún no se pudo guardar. Se reintentará al recuperar la conexión.'
        : loadedRemote
          ? 'Partida cargada desde la nube.'
          : 'Nube activada. Guarda el código de sincronización.',
      { tone: failed ? 'warning' : 'success' },
    )
    return true
  } catch (error) {
    cloudStatus.value = 'error'
    cloudError.value = cloudErrorMessage(error)
    toast(cloudErrorMessage(error), { tone: 'error' })
    return false
  } finally {
    cloudBusy.value = false
  }
}

async function disableCloud(): Promise<void> {
  if (cloudTimer) {
    clearTimeout(cloudTimer)
    cloudTimer = null
  }
  cloudUnsubscribe?.()
  cloudUnsubscribe = null
  cloudEnabled.value = false
  cloudWatchVia = null
  cloudStatus.value = 'disabled'
  cloudLastSaved.value = null
  cloudRemoteAt.value = null
  cloudError.value = ''
  cloudReady = false
  await saveCloudSettings({ enabled: false, code: cloudCode.value })
  toast('Sincronización en la nube desactivada. El código se conserva.', { tone: 'info' })
}

async function restoreFromCloud(confirm = true): Promise<boolean> {
  if (!cloudConfigured || !isValidSyncCode(cloudCode.value)) return false
  if (loading.value) {
    toast('Espera a que termine el turno antes de restaurar.', { tone: 'warning' })
    return false
  }
  cloudBusy.value = true
  try {
    const remote = await readCloudSnapshot(cloudCode.value)
    if (!remote) {
      toast('No hay ninguna partida guardada con este código.', { tone: 'warning' })
      return false
    }
    if (confirm && messages.value.length) {
      const result = await confirmAction({
        title: '¿Restaurar desde la nube?',
        message:
          'Se reemplazará la partida, la memoria y los ajustes de este navegador por la copia de la nube. La API key local se conserva.',
        confirmLabel: 'Restaurar',
        cancelLabel: 'Cancelar',
        danger: true,
      })
      if (result !== 'confirm') return false
    }
    applyCloudProgress(remote.progress)
    cloudLastSaved.value = remote.updatedAt
    cloudRemoteAt.value = null
    cloudNotifiedAt = remote.updatedAt
    cloudStatus.value = 'saved'
    cloudError.value = ''
    toast('Partida restaurada desde la nube.', { tone: 'success' })
    return true
  } catch (error) {
    cloudStatus.value = 'error'
    cloudError.value = cloudErrorMessage(error)
    toast(cloudErrorMessage(error), { tone: 'error' })
    return false
  } finally {
    cloudBusy.value = false
  }
}

function friendlyError(error: unknown): string {
  if (error instanceof ApiError) {
    const text = error.message
    if (error.code === 401 || error.code === 403) {
      return 'La API key fue rechazada. Revísala en Ajustes → Conexión.'
    }
    if (error.code === 404) {
      return 'No se encontró el endpoint o el modelo. Revisa la URL base y el nombre del modelo.'
    }
    if (error.code === 429) {
      return 'El modelo está saturado o alcanzaste tu límite. Espera un momento e intenta de nuevo.'
    }
    if (error.code === 408 || error.code === 504 || error.code === 524 || /tardó demasiado/i.test(text)) {
      return settings.stream
        ? 'El modelo tardó demasiado. Con razonamiento max puede pasar; prueba con xhigh o high.'
        : 'El modelo tardó demasiado. Activa el streaming en Ajustes o baja el razonamiento.'
    }
    if (isContextError(text)) {
      return 'El historial supera la ventana del modelo. Reduce la ventana de contexto en Ajustes → Conexión.'
    }
    if (error.code >= 500) {
      return `El proveedor falló (HTTP ${error.code}). Reintenta en un momento.`
    }
    if (/No se pudo contactar/i.test(text)) {
      return 'No se pudo contactar al modelo. Revisa la URL base, tu conexión o si el servidor permite CORS.'
    }
    return text
  }
  return 'No se pudo contactar al modelo. Revisa la key y la conexión.'
}

// ---------------------------------------------------------------------------
// Turnos
// ---------------------------------------------------------------------------

function applyProgress() {
  progressFrame = 0
  if (!pendingProgress || !loading.value) return
  const progress = pendingProgress
  pendingProgress = null
  const stamp = Date.now()
  if (!progress.content && !progress.reasoningChars) {
    // Nuevo intento tras un reintento automático: la medición empieza de cero.
    reasoningStartedAt.value = 0
    reasoningEndedAt.value = 0
    contentStartedAt.value = 0
    reasoningPace.reset()
    reasoningTail.value = ''
  }
  // El fondo difuminado se refresca como mucho cada ~200 ms: no hace falta más y desenfocar cuesta.
  if (progress.reasoningTail !== undefined && !progress.content && stamp - tailStampedAt > 200) {
    reasoningTail.value = progress.reasoningTail
    tailStampedAt = stamp
  }
  if (progress.reasoningChars > 0 && !progress.content) {
    reasoningPace.push(stamp, charsToTokens(progress.reasoningChars))
  }
  if (progress.reasoningChars > 0 && !reasoningStartedAt.value) reasoningStartedAt.value = stamp
  if (progress.content && !contentStartedAt.value) {
    contentStartedAt.value = stamp
    if (reasoningStartedAt.value) reasoningEndedAt.value = stamp
  }
  streamText.value = progress.content
  reasoningChars.value = progress.reasoningChars
  phase.value = progress.content ? 'writing' : progress.reasoningChars > 0 ? 'thinking' : 'waiting'
  streamNonce.value++
}

function onProgress(progress: StreamProgress) {
  pendingProgress = progress
  if (progressFrame) return
  progressFrame =
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(applyProgress)
      : (setTimeout(applyProgress, 16) as unknown as number)
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false && requiresApiKey(settings.baseUrl)
}

/** Pide la respuesta del DM al último mensaje del jugador. Devuelve si tuvo éxito. */
async function generateResponse(): Promise<boolean> {
  if (loading.value) return false
  if (!ensureConfigured()) return false
  const last = lastMessage.value
  if (!last || last.role !== 'user') return false
  if (isOffline()) {
    errorKind.value = 'error'
    errorMessage.value = 'Estás sin conexión. Tu partida está guardada; reintenta cuando vuelva la red.'
    return false
  }

  stopSpeech()
  const controller = new AbortController()
  abortController = controller
  const id = newMessageId()
  pendingId.value = id
  streamText.value = ''
  reasoningChars.value = 0
  reasoningTail.value = ''
  tailStampedAt = 0
  pendingProgress = null
  phase.value = 'waiting'
  turnStartedAt.value = Date.now()
  reasoningStartedAt.value = 0
  reasoningEndedAt.value = 0
  contentStartedAt.value = 0
  reasoningPace.reset()
  now.value = Date.now()
  if (clock) clearInterval(clock)
  clock = setInterval(() => (now.value = Date.now()), 250)
  errorMessage.value = ''
  loading.value = true

  try {
    // El DM necesita la memoria al día: espera al Cronista del turno anterior si sigue trabajando.
    await waitForMemory(controller.signal)
    const prompt = systemPrompt()
    const history = [...messages.value]
    const result = await chatWithFallback(settings, prompt, history, {
      stream: settings.stream,
      signal: controller.signal,
      onProgress,
    })
    applyProgress()
    const finishedAt = Date.now()
    const firstTokenAt = reasoningStartedAt.value || contentStartedAt.value
    const speed = result.streamed && firstTokenAt ? rate(result.usage.completion, firstTokenAt, finishedAt) : null
    const turnUsage: TokenUsage = { ...result.usage, durationMs: finishedAt - turnStartedAt.value }
    if (speed) turnUsage.tokensPerSecond = speed
    if (result.contextWindow) {
      settings.contextWindow = result.contextWindow
      persistSettings()
      toast(`Ajusté la ventana de contexto a ${formatTokens(result.contextWindow)} tokens según el modelo.`, {
        tone: 'info',
      })
    }

    let assistant = createMessage('assistant', result.content, id)

    // Un prompt personalizado antiguo puede seguir pidiendo [ESTADO] al DM: se respeta y no hace falta el Cronista.
    const legacyState = hasFullState(assistant.state)
    if (legacyState) {
      const memory = mergeState(gameState.value, assistant.state)
      assistant = { ...assistant, memory }
      gameState.value = memory
    } else if (assistant.state) {
      // Solo el cuaderno secreto [TRAMA]: se aplica sin tocar el resto de la memoria.
      gameState.value = mergeState(gameState.value, assistant.state, { partial: true })
    }
    messages.value = [...messages.value, assistant]
    usage.value = turnUsage
    persistGame()
    if (!result.streamed) requestScroll(assistant.id)
    announce(
      assistant.diceRequest
        ? 'El Dungeon Master pide una tirada.'
        : 'El Dungeon Master ha respondido.',
    )
    // Tras la narración, en paralelo con la lectura: primero la memoria y después las opciones.
    startPostTurn(assistant, history, result.effort, !legacyState)
    if (settings.autoRead) speak(assistant, true)
    return true
  } catch (error) {
    if (error instanceof CancelledError) {
      errorKind.value = 'cancelled'
      errorMessage.value = 'Cancelaste el turno. Puedes reintentarlo o editar tu mensaje.'
    } else {
      errorKind.value = 'error'
      errorMessage.value = friendlyError(error)
    }
    return false
  } finally {
    if (progressFrame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(progressFrame)
    progressFrame = 0
    pendingProgress = null
    if (clock) clearInterval(clock)
    clock = null
    loading.value = false
    phase.value = 'idle'
    pendingId.value = null
    streamText.value = ''
    reasoningTail.value = ''
    abortController = null
  }
}

function cancelTurn() {
  abortController?.abort()
}

/** Espera al Cronista del turno anterior; Detener lo interrumpe. */
async function waitForMemory(signal: AbortSignal): Promise<void> {
  const task = memoryTask
  if (!task) return
  phase.value = 'memory'
  await new Promise<void>((resolve) => {
    const stop = () => resolve()
    signal.addEventListener('abort', stop, { once: true })
    void task.finally(() => {
      signal.removeEventListener('abort', stop)
      resolve()
    })
  })
  if (signal.aborted) throw new CancelledError()
}

function cancelMemory() {
  memoryController?.abort()
}

/** Mensajes que necesita el Cronista: desde el último turno con memoria registrada (máx. 6). */
function memoryHistory(id: string): ChatMessage[] {
  const list = messages.value
  const end = list.findIndex((message) => message.id === id)
  if (end === -1) return []
  let start = end
  for (let i = end - 1; i >= 0 && end - i <= 6; i--) {
    if (list[i].role === 'assistant' && typeof list[i].memory === 'string') break
    start = i
  }
  return list.slice(start, end + 1)
}

/**
 * Cronista de estado: lee la narración y actualiza la memoria (solo las secciones que cambiaron).
 * Nunca rechaza: si falla avisa, y el siguiente turno repetirá el intento con lo pendiente.
 */
async function refreshMemory(message: ChatMessage): Promise<void> {
  cancelMemory()
  const controller = new AbortController()
  memoryController = controller
  memoryTarget = message.id
  memoryPending.value = true
  agentAttempt.value = 1
  try {
    // Sin streaming: si falla (red, tiempo, respuesta inválida) se repite sola hasta 3 veces.
    const incoming = await withRetries(
      async () => {
        const reply = await requestMemoryUpdate(
          settings,
          buildStatePrompt(settings, gameState.value),
          [...memoryHistory(message.id), createMessage('user', INSTRUCCION_ESTADO)],
          controller.signal,
        )
        const parsed = parseStateReply(reply)
        if (parsed === null) throw new ApiError('El Cronista no devolvió un bloque [ESTADO] válido.')
        return parsed
      },
      { signal: controller.signal, onAttempt: (attempt) => (agentAttempt.value = attempt) },
    )
    const index = messages.value.findIndex((item) => item.id === message.id)
    if (controller.signal.aborted || index === -1) return
    const memory = mergeState(gameState.value, incoming, { partial: true, protectSecret: true })
    gameState.value = memory
    const copy = [...messages.value]
    copy[index] = { ...copy[index], memory }
    messages.value = copy
    persistGame()
  } catch (error) {
    if (error instanceof CancelledError || controller.signal.aborted) return
    console.warn('No se pudo actualizar la memoria', error)
    toast('No se pudo actualizar la memoria tras varios intentos. Se reintentará con el siguiente turno.', {
      tone: 'warning',
      action: { label: 'Reintentar', run: retryMemory },
    })
  } finally {
    if (memoryController === controller) {
      memoryController = null
      memoryTarget = null
      memoryPending.value = false
    }
  }
}

/**
 * Después de cada narración: actualiza la memoria (si hace falta) y luego pide las opciones.
 * Las opciones se piden con la memoria ya actualizada; si el jugador actúa antes, se omiten.
 */
function startPostTurn(
  message: ChatMessage,
  history: ChatMessage[],
  effort: Reasoning | null,
  updateMemory: boolean,
) {
  const next = () => {
    const last = lastMessage.value
    if (last?.id === message.id && needsOptions(last)) {
      void fetchOptions(last, history, optionsSystemPrompt(), effort)
    }
  }
  if (!updateMemory) {
    next()
    return
  }
  const task = refreshMemory(message)
  memoryTask = task
  void task.then(() => {
    if (memoryTask === task) memoryTask = null
    next()
  })
}

/** Reintento manual de la memoria del último turno (aviso de error). */
function retryMemory() {
  const last = lastMessage.value
  if (loading.value || memoryPending.value || !last || last.role !== 'assistant') return
  if (!ensureConfigured()) return
  startPostTurn(last, messages.value.slice(0, -1), settings.reasoning, true)
}

/** Tras una tirada pendiente no hay opciones; en el resto de turnos las genera la segunda llamada. */
function needsOptions(message: ChatMessage): boolean {
  return message.role === 'assistant' && !message.diceRequest && !message.options.length && Boolean(message.display.trim())
}

function cancelOptions() {
  optionsController?.abort()
  optionsController = null
  optionsFor = null
  optionsPending.value = false
}

/**
 * Segunda llamada: pide las 5 opciones con el mismo esfuerzo que la narración. No bloquea
 * al jugador: si escribe otra acción, regenera o cambia la partida, la llamada se descarta.
 */
async function fetchOptions(
  message: ChatMessage,
  history: ChatMessage[],
  prompt: string,
  effort: Reasoning | null,
): Promise<void> {
  cancelOptions()
  const controller = new AbortController()
  optionsController = controller
  optionsFor = message.id
  optionsPending.value = true
  agentAttempt.value = 1
  try {
    // Sin streaming: se repite sola hasta 3 veces si falla o si no devuelve 5 opciones válidas.
    const generated = await withRetries(
      async () => {
        const content = await requestOptions(
          settings,
          prompt,
          [...history, message, createMessage('user', INSTRUCCION_OPCIONES)],
          effort,
          controller.signal,
        )
        const reply = createMessage('assistant', content)
        if (reply.diceRequest || !reply.options.length) {
          throw new ApiError('El modelo no devolvió opciones válidas.')
        }
        return reply
      },
      { signal: controller.signal, onAttempt: (attempt) => (agentAttempt.value = attempt) },
    )
    // La partida pudo avanzar mientras tanto: solo se aplica si sigue siendo la última respuesta.
    if (controller.signal.aborted || optionsFor !== message.id) return
    const index = messages.value.findIndex((item) => item.id === message.id)
    if (index === -1 || index !== messages.value.length - 1) return
    const current = messages.value[index]
    const withOptions = attachOptions(current, generated)
    if (!withOptions) throw new ApiError('El modelo no devolvió opciones válidas.')
    const copy = [...messages.value]
    copy[index] = { ...withOptions, memory: current.memory }
    messages.value = copy
    persistMessages()
    announce('Ya están las opciones.')
  } catch (error) {
    if (error instanceof CancelledError || controller.signal.aborted) return
    console.warn('No se pudieron generar las opciones', error)
    if (optionsFor === message.id) {
      toast('No se pudieron generar las opciones tras varios intentos. Puedes reintentar o escribir tu acción.', {
        tone: 'warning',
      })
    }
  } finally {
    if (optionsController === controller) {
      optionsController = null
      optionsFor = null
      optionsPending.value = false
    }
  }
}

/** Reintento manual (o para partidas antiguas sin opciones): usa el esfuerzo de los ajustes. */
function generateOptions() {
  const last = lastMessage.value
  if (loading.value || optionsPending.value || !last || !needsOptions(last)) return
  if (!ensureConfigured()) return
  void fetchOptions(last, messages.value.slice(0, -1), optionsSystemPrompt(), settings.reasoning)
}

async function send(text: string): Promise<boolean> {
  if (loading.value) return false
  const clean = text.trim()
  if (!clean) return false
  if (!ensureConfigured()) return false
  stopSpeech()
  const userMessage = createMessage('user', clean)
  messages.value = [...messages.value, userMessage]
  errorMessage.value = ''
  persistMessages()
  requestScroll('bottom')
  return generateResponse()
}

function startAdventure() {
  if (loading.value) return
  if (!ensureConfigured()) return
  void send(`<Comienza la campaña de ${settings.character} siguiendo el protocolo de inicio.>`)
}

function retry() {
  if (lastMessage.value?.role === 'user') void generateResponse()
}

/** Vuelve a pedir la última respuesta del DM. Si falla, restaura la anterior. */
async function regenerate() {
  if (loading.value) return
  const last = lastMessage.value
  if (!last || last.role !== 'assistant') return
  const previousState = gameState.value
  const remaining = messages.value.slice(0, -1)
  messages.value = remaining
  gameState.value = memoryAfter(remaining)
  persistGame()
  const ok = await generateResponse()
  if (!ok) {
    messages.value = [...messages.value, last]
    gameState.value = previousState
    persistGame()
    errorMessage.value = ''
    toast('Se restauró la respuesta anterior.', { tone: 'info' })
  }
}

/**
 * Elimina un mensaje del jugador y todo lo posterior, y devuelve su texto al
 * cuadro de escritura. Se puede deshacer desde el aviso.
 */
function editMessage(id: string) {
  if (loading.value) return
  const index = messages.value.findIndex((message) => message.id === id)
  const target = messages.value[index]
  if (index === -1 || target.role !== 'user') return
  const removed = messages.value.slice(index)
  const previousState = gameState.value
  const previousDraft = draft.value
  const remaining = messages.value.slice(0, index)
  stopSpeech()
  messages.value = remaining
  gameState.value = memoryAfter(remaining)
  errorMessage.value = ''
  persistGame()
  draft.value = target.content
  focusComposer()
  const count = removed.length
  toast(count > 1 ? `Se deshicieron ${count} mensajes. Edita tu acción.` : 'Edita tu acción y envíala de nuevo.', {
    action: {
      label: 'Deshacer',
      run: () => {
        if (loading.value || messages.value.length !== remaining.length) {
          toast('Ya no se puede deshacer: la partida avanzó.', { tone: 'warning' })
          return
        }
        messages.value = [...messages.value, ...removed]
        gameState.value = previousState
        draft.value = previousDraft
        persistGame()
        requestScroll(removed[removed.length - 1].id)
      },
    },
  })
}

function newGame() {
  cancelTurn()
  stopSpeech()
  messages.value = []
  gameState.value = ''
  usage.value = null
  errorMessage.value = ''
  draft.value = ''
  diceGroups.value = defaultDice()
  diceResults.value = null
  track(clearGameStorage())
  requestScroll('bottom')
  diceOpen.value = false
  contextOpen.value = false
  memoryOpen.value = false
  if (cloudEnabled.value) {
    scheduleCloudSave(true)
    toast('La copia en la nube también se reiniciará.', { tone: 'info' })
  }
}

function saveConfig(next: Settings) {
  const modelChanged = next.model !== settings.model || next.baseUrl !== settings.baseUrl
  Object.assign(settings, next)
  persistSettings()
  if (modelChanged) {
    usage.value = null
    track(saveUsage(null))
  }
  settingsOpen.value = false
  refreshBrowserVoices()
}

function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  settings[key] = value
  persistSettings()
}

/** Edición manual de la memoria: también actualiza la instantánea del último turno. */
function updateMemory(memory: string) {
  gameState.value = memory.trim()
  const index = messages.value.map((message) => message.role).lastIndexOf('assistant')
  if (index !== -1) {
    const copy = [...messages.value]
    copy[index] = { ...copy[index], memory: gameState.value }
    messages.value = copy
  }
  persistGame()
}

function setAutoRead(value: boolean) {
  updateSetting('autoRead', value)
}

// ---------------------------------------------------------------------------
// Dados
// ---------------------------------------------------------------------------

function openDice(prefill?: DiceRequest[]) {
  if (!ensureConfigured()) return
  if (loading.value) return
  diceResults.value = null
  const stored = loadDiceGroups()
  if (prefill?.length) diceGroups.value = prefill.map(toGroup)
  else if (stored) diceGroups.value = stored
  else if (diceSuggestions.value.length) diceGroups.value = diceSuggestions.value[0].requests.map(toGroup)
  else diceGroups.value = defaultDice()
  diceOpen.value = true
}

function closeDice() {
  if (!diceResults.value) {
    track(saveDiceGroups(diceGroups.value))
    scheduleCloudSave()
  }
  diceResults.value = null
  diceOpen.value = false
}

/**
 * Lanza y envía al DM en el mismo paso: el resultado queda comprometido aunque
 * se cierre el diálogo durante la animación.
 */
/** Vibración breve en el móvil al lanzar (más marcada con un crítico o una pifia). */
function vibrateFor(rolls: DiceRoll[]) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const pattern = rolls.some((roll) => roll.natural === 20)
    ? [40, 60, 40, 60, 140]
    : rolls.some((roll) => roll.natural === 1)
      ? [220]
      : [25, 45, 25]
  try {
    navigator.vibrate(pattern)
  } catch {
    // Algunos navegadores bloquean la vibración: no es esencial.
  }
}

function rollAndSend(requests: DiceRequest[]): DiceRoll[] {
  if (!requests.length || loading.value) return []
  if (!ensureConfigured()) return []
  const rolls = requests.map((request) => rollRequest(request))
  vibrateFor(rolls)
  diceResults.value = rolls
  diceOpen.value = true
  track(clearDiceGroups())
  diceGroups.value = defaultDice()
  void send(messageFor(rolls))
  return rolls
}

// ---------------------------------------------------------------------------
// Voz
// ---------------------------------------------------------------------------

function refreshBrowserVoices() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    browserVoices.value = []
    return
  }
  const all = window.speechSynthesis.getVoices()
  const spanish = all.filter((voice) => voice.lang.toLowerCase().startsWith('es'))
  browserVoices.value = spanish.length ? spanish : all
  window.speechSynthesis.onvoiceschanged = refreshBrowserVoices
  if (
    all.length &&
    settings.browserVoice &&
    !all.some((voice) => voice.voiceURI === settings.browserVoice)
  ) {
    settings.browserVoice = ''
    persistSettings()
  }
}

function bestBrowserVoice(): SpeechSynthesisVoice | null {
  const list = browserVoices.value
  if (!list.length) return null
  const score = (voice: SpeechSynthesisVoice) => {
    let points = 0
    if (/es-CO/i.test(voice.lang)) points += 50
    else if (/es-US/i.test(voice.lang)) points += 40
    else if (/es-MX/i.test(voice.lang)) points += 30
    else if (/es-ES/i.test(voice.lang)) points += 20
    if (/natural|online/i.test(voice.name)) points += 15
    if (!voice.localService) points += 5
    return points
  }
  return [...list].sort((a, b) => score(b) - score(a))[0]
}

function resolveVoice(voiceURI = settings.browserVoice): SpeechSynthesisVoice | null {
  const selected = voiceURI
    ? browserVoices.value.find((voice) => voice.voiceURI === voiceURI)
    : null
  return selected ?? bestBrowserVoice()
}

/**
 * Sesión de lectura en curso. Se guarda el trozo y la posición para poder pausar sin
 * depender de speechSynthesis.pause()/resume(), que en Android y con las voces «online»
 * se comporta como una cancelación y luego no vuelve a sonar.
 */
interface SpeechSession {
  id: string
  chunks: string[]
  /** Palabras que hay antes de cada trozo (para localizar la palabra en todo el texto). */
  wordBase: number[]
  index: number
  /** Posición (caracteres) dentro del trozo actual, según los eventos de límite de palabra. */
  offset: number
  voice: SpeechSynthesisVoice | null
  rate?: number
  auto?: boolean
}
let speechSession: SpeechSession | null = null

function stopSpeech() {
  speechToken++
  speechSession = null
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    if (speakingId.value || window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      window.speechSynthesis.cancel()
    }
  }
  speakingId.value = null
  ttsPaused.value = false
  speechWords.value = []
  speechWordIndex.value = -1
}

/** Guarda la posición (caracteres del trozo actual) y la palabra que suena en todo el texto. */
function markSpeechPosition(session: SpeechSession, offset: number) {
  session.offset = offset
  const chunk = session.chunks[session.index] ?? ''
  speechWordIndex.value = session.wordBase[session.index] + wordIndexAt(chunk, offset)
}

/** Habla el trozo `index` de la sesión desde `offset`, y encadena los siguientes. */
function playSession(session: SpeechSession) {
  const synth = window.speechSynthesis
  const token = ++speechToken
  const speakChunk = () => {
    if (token !== speechToken) return
    if (session.index >= session.chunks.length) {
      stopSpeech()
      return
    }
    const chunk = session.chunks[session.index]
    const base = session.offset
    const rest = chunk.slice(base)
    const text = rest.trim()
    if (!text) {
      session.index++
      session.offset = 0
      speakChunk()
      return
    }
    // Posición absoluta (en el trozo) del primer carácter que se va a pronunciar.
    const origin = base + (rest.length - rest.trimStart().length)
    const rate = session.rate ?? settings.speechRate
    const player = new SpeechSynthesisUtterance(text)
    if (session.voice) {
      player.voice = session.voice
      player.lang = session.voice.lang
    } else {
      player.lang = 'es-CO'
    }
    player.rate = rate
    player.pitch = 1

    // Si la voz emite eventos de palabra se usan; si no (muchas voces online) se estima por tiempo.
    let heardBoundary = false
    let startedAt = performance.now()
    let timer: ReturnType<typeof setInterval> | null = null
    const stopTimer = () => {
      if (timer) clearInterval(timer)
      timer = null
    }
    markSpeechPosition(session, origin)
    timer = setInterval(() => {
      if (token !== speechToken || heardBoundary) {
        stopTimer()
        return
      }
      const elapsed = performance.now() - startedAt
      if (elapsed < 600) return
      const estimated = origin + estimateOffset(text, elapsed, rate)
      if (estimated > session.offset) markSpeechPosition(session, estimated)
    }, 120)

    player.onstart = () => {
      startedAt = performance.now()
    }
    // Recuerda por dónde va: al reanudar se retoma desde la última palabra iniciada.
    player.onboundary = (event) => {
      if (token !== speechToken || event.name === 'sentence') return
      heardBoundary = true
      markSpeechPosition(session, origin + event.charIndex)
    }
    player.onend = () => {
      stopTimer()
      if (token !== speechToken) return
      session.index++
      session.offset = 0
      speakChunk()
    }
    player.onerror = (event) => {
      stopTimer()
      if (token !== speechToken) return
      const code = (event as SpeechSynthesisErrorEvent).error
      if (code === 'interrupted' || code === 'canceled') return
      ttsError.value =
        session.auto && session.index === 0
          ? 'El navegador bloqueó la lectura automática. Toca el altavoz del mensaje.'
          : 'No se pudo reproducir la voz del navegador.'
      stopSpeech()
    }
    synth.speak(player)
  }
  speakChunk()
}

function speakText(
  text: string,
  options: { id: string; auto?: boolean; voiceURI?: string; rate?: number },
): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    ttsError.value = 'Este navegador no soporta la voz del sistema.'
    return false
  }
  stopSpeech()
  const chunks = chunkForSpeech(cleanForSpeech(text))
  if (!chunks.length) return false
  let total = 0
  const wordBase = chunks.map((chunk) => {
    const before = total
    total += chunk.split(' ').filter(Boolean).length
    return before
  })
  const session: SpeechSession = {
    id: options.id,
    chunks,
    wordBase,
    index: 0,
    offset: 0,
    voice: resolveVoice(options.voiceURI),
    rate: options.rate,
    auto: options.auto,
  }
  speechSession = session
  speakingId.value = options.id
  ttsPaused.value = false
  ttsError.value = ''
  speechWords.value = spokenWords(chunks)
  speechWordIndex.value = 0
  playSession(session)
  return true
}

function pauseSpeech() {
  const session = speechSession
  if (!session) return
  // Invalida los manejadores del trozo actual y corta el audio: reanudar lo vuelve a lanzar.
  speechToken++
  window.speechSynthesis.cancel()
  ttsPaused.value = true
}

function resumeSpeech() {
  const session = speechSession
  if (!session) return
  ttsPaused.value = false
  ttsError.value = ''
  playSession(session)
}

function speak(message: ChatMessage, auto = false): boolean {
  if (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    speechSession &&
    speakingId.value === message.id
  ) {
    if (ttsPaused.value) resumeSpeech()
    else pauseSpeech()
    return true
  }
  return speakText(message.display, { id: message.id, auto })
}

function previewVoice(voiceURI: string, rate: number) {
  speakText(
    `Saludos, aventurera. Soy la voz que narrará las crónicas de ${settings.character}.`,
    { id: 'preview', voiceURI, rate },
  )
}

function toggleSpeech(message: ChatMessage) {
  speak(message)
}

// ---------------------------------------------------------------------------
// Progreso
// ---------------------------------------------------------------------------

function exportProgress(includeApiKey = false) {
  downloadProgress(
    serializeProgress(settings, messages.value, gameState.value, usage.value, diceGroups.value, {
      includeApiKey,
    }),
  )
}

/** Aplica un progreso ya validado, venga de un archivo o de la nube. */
function applyProgressData(data: ProgressFile) {
  stopSpeech()
  const currentKey = settings.apiKey
  Object.assign(settings, data.settings)
  // Un archivo o una copia sin key conserva la key de este navegador.
  if (!settings.apiKey.trim() && currentKey.trim()) settings.apiKey = currentKey
  messages.value = data.messages.map((item) => {
    const message = createMessage(item.role, item.content)
    if (item.role === 'assistant' && typeof item.memory === 'string') message.memory = item.memory
    return message
  })
  gameState.value = data.state
  usage.value = data.usage
  diceGroups.value = data.dice.length ? data.dice : defaultDice()
  errorMessage.value = ''
  persistSettings()
  persistGame()
  track(saveDiceGroups(diceGroups.value))
  refreshBrowserVoices()
  requestScroll(messages.value.length ? messages.value[messages.value.length - 1].id : 'bottom')
}

async function importProgress(file: File) {
  if (loading.value) {
    throw new Error('Espera a que el Dungeon Master termine el turno antes de importar.')
  }
  const data = await parseProgressFile(file)
  applyProgressData(data)
  scheduleCloudSave(true)
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

function init() {
  if (initialized) return
  initialized = true
  if (!configured.value) openSettings('connection')
  if (messages.value.length) {
    requestScroll(messages.value[messages.value.length - 1].id)
  }
  refreshBrowserVoices()
  void initCloud()
  if (typeof window !== 'undefined') {
    window.addEventListener('online', reconnectCloud)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reconnectCloud()
    })
  }
}

export function useGame() {
  return {
    settings,
    messages,
    displayMessages,
    gameState,
    usage,
    loading,
    phase,
    optionsPending,
    memoryPending,
    agentAttempt,
    reasoningTail,
    optionsMissing,
    generateOptions,
    turnStartedAt,
    pendingId,
    streamText,
    reasoningChars,
    liveStats,
    now,
    draft,
    errorMessage,
    errorKind,
    storageFailed,
    announcement,
    cloudConfigured,
    cloudEnabled,
    cloudCode,
    cloudStatus,
    cloudError,
    cloudLastSaved,
    cloudRemoteAt,
    cloudBusy,
    cloudVia,
    settingsOpen,
    settingsTab,
    diceOpen,
    diceResults,
    contextOpen,
    memoryOpen,
    panelOpen,
    diceGroups,
    browserVoices,
    speakingId,
    ttsPaused,
    speechWords,
    speechWordIndex,
    ttsError,
    scrollTarget,
    scrollNonce,
    streamNonce,
    composerFocusNonce,
    lastMessage,
    lastAssistant,
    diceRequested,
    diceSuggestions,
    visibleOptions,
    hasMessages,
    awaitingReply,
    configured,
    contextTokens,
    reasoningTokens,
    init,
    send,
    startAdventure,
    retry,
    regenerate,
    editMessage,
    cancelTurn,
    newGame,
    saveConfig,
    updateSetting,
    updateMemory,
    setAutoRead,
    openSettings,
    exportProgress,
    importProgress,
    enableCloud,
    disableCloud,
    restoreFromCloud,
    flushCloudSave,
    openDice,
    closeDice,
    rollAndSend,
    refreshBrowserVoices,
    stopSpeech,
    speak,
    previewVoice,
    toggleSpeech,
    focusComposer,
    generateResponse,
    requestScroll,
  }
}
