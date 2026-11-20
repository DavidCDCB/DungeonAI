import { computed, reactive, ref, shallowRef, watch } from 'vue'
import type {
  ChatMessage,
  DiceGroup,
  DiceRequest,
  DiceRoll,
  Settings,
  TokenUsage,
  TurnPhase,
} from '../types'
import { DEFAULT_SETTINGS } from '../types'
import {
  ApiError,
  CancelledError,
  chatWithFallback,
  requestMissingOptions,
  type StreamProgress,
} from '../lib/api'
import { messageFor, rollRequest, suggestDice, toGroup } from '../lib/dice'
import { memoryAfter, mergeState } from '../lib/gameState'
import {
  createMessage,
  newMessageId,
  prepareRepairContent,
  streamingPreview,
} from '../lib/messages'
import { INSTRUCCION_REPARACION, buildSystemPrompt } from '../lib/prompt'
import { requiresApiKey } from '../lib/providers'
import { isContextError } from '../lib/sse'
import { downloadProgress, parseProgressFile, serializeProgress } from '../lib/transfer'
import { chunkForSpeech, cleanForSpeech } from '../lib/ttsText'
import { estimateOffset, spokenWords, wordIndexAt } from '../lib/speechHighlight'
import { formatTokens } from '../lib/format'
import { charsToTokens } from '../lib/contextBudget'
import { createPaceMeter } from '../lib/pace'
import {
  clearDiceGroups,
  clearGameStorage,
  loadDiceGroups,
  loadDraft,
  loadMessages,
  loadSettings,
  loadState,
  loadUsage,
  saveDiceGroups,
  saveDraft,
  saveMessages,
  saveSettings,
  saveState,
  saveUsage,
} from '../lib/storage'
import { useToasts } from './useToasts'

export type SettingsTab = 'connection' | 'campaign' | 'world' | 'prompt' | 'reading' | 'data'

const { push: toast } = useToasts()

const settings = reactive<Settings>(loadSettings(DEFAULT_SETTINGS))
const messages = ref<ChatMessage[]>(loadMessages())
const gameState = ref(loadState())
const usage = ref<TokenUsage | null>(loadUsage())

const loading = ref(false)
const phase = ref<TurnPhase>('idle')
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
let initialized = false
let clock: ReturnType<typeof setInterval> | null = null
let draftTimer: ReturnType<typeof setTimeout> | null = null
let pendingProgress: StreamProgress | null = null
let progressFrame = 0

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
    if (!draftTimer) return
    clearTimeout(draftTimer)
    draftTimer = null
    track(saveDraft(draft.value))
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
}

function persistGame() {
  track(
    Promise.all([saveMessages(messages.value), saveState(gameState.value), saveUsage(usage.value)]).then(
      (results) => results.every(Boolean),
    ),
  )
}

function persistSettings() {
  track(saveSettings(settings))
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

function systemPrompt(): string {
  return buildSystemPrompt(settings, gameState.value)
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
  if (phase.value !== 'repairing') {
    phase.value = progress.content
      ? 'writing'
      : progress.reasoningChars > 0
        ? 'thinking'
        : 'waiting'
  }
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

  const prompt = systemPrompt()
  const history = [...messages.value]
  try {
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
    if (!assistant.options.length && !assistant.diceRequest) {
      phase.value = 'repairing'
      try {
        const repairHistory = [...history, assistant, createMessage('user', INSTRUCCION_REPARACION)]
        const repairContent = await requestMissingOptions(settings, prompt, repairHistory, controller.signal)
        if (repairContent) {
          const repaired = prepareRepairContent(assistant, createMessage('assistant', repairContent))
          if (repaired) assistant = repaired
        }
      } catch (repairError) {
        if (repairError instanceof CancelledError) throw repairError
        console.warn('No se pudieron completar las opciones', repairError)
      }
    }

    const memory = mergeState(gameState.value, assistant.state)
    assistant = { ...assistant, memory }
    messages.value = [...messages.value, assistant]
    gameState.value = memory
    usage.value = turnUsage
    persistGame()
    if (!result.streamed) requestScroll(assistant.id)
    announce(
      assistant.diceRequest
        ? 'El Dungeon Master pide una tirada.'
        : 'El Dungeon Master ha respondido.',
    )
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
    abortController = null
  }
}

function cancelTurn() {
  abortController?.abort()
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
  if (!diceResults.value) track(saveDiceGroups(diceGroups.value))
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

async function importProgress(file: File) {
  if (loading.value) {
    throw new Error('Espera a que el Dungeon Master termine el turno antes de importar.')
  }
  const data = await parseProgressFile(file)
  stopSpeech()
  const currentKey = settings.apiKey
  Object.assign(settings, data.settings)
  // Un archivo exportado sin key conserva la key de este navegador.
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
