import { computed, reactive, ref } from 'vue'
import type {
  ChatMessage,
  DiceGroup,
  DiceRequest,
  Settings,
  TokenUsage,
} from '../types'
import { DEFAULT_SETTINGS } from '../types'
import { ApiError, chatWithFallback, requestMissingOptions } from '../lib/api'
import { messageFor, rollDice, joinWithAnd, notation } from '../lib/dice'
import { mergeState } from '../lib/gameState'
import {
  createMessage,
  prepareRepairContent,
} from '../lib/messages'
import { INSTRUCCION_REPARACION, buildSystemPrompt } from '../lib/prompt'
import { requiresApiKey } from '../lib/providers'
import { downloadProgress, parseProgressFile, serializeProgress } from '../lib/transfer'
import { cleanForSpeech } from '../lib/ttsText'
import {
  clearDiceGroups,
  clearGameStorage,
  loadDiceGroups,
  loadMessages,
  loadSettings,
  loadState,
  loadUsage,
  saveDiceGroups,
  saveMessages,
  saveSettings,
  saveState,
  saveUsage,
} from '../lib/storage'

const settings = reactive<Settings>(loadSettings(DEFAULT_SETTINGS))
const messages = ref<ChatMessage[]>(loadMessages())
const gameState = ref(loadState())
const usage = ref<TokenUsage | null>(loadUsage())

const loading = ref(false)
const escribiendo = ref(false)
const draft = ref('')
const errorMessage = ref('')

const settingsOpen = ref(false)
const diceOpen = ref(false)
const contextOpen = ref(false)

const defaultDice = (): DiceGroup[] => [{ die: 'd20', count: '1', bonus: '0' }]
const diceGroups = ref<DiceGroup[]>(loadDiceGroups() ?? defaultDice())

const scrollTarget = ref<string | null>(null)
const scrollNonce = ref(0)

const browserVoices = ref<SpeechSynthesisVoice[]>([])

const speakingId = ref<string | null>(null)
const ttsPaused = ref(false)
const ttsError = ref('')

let utterance: SpeechSynthesisUtterance | null = null
let speechToken = 0
let initialized = false

const lastAssistant = computed(() =>
  [...messages.value].reverse().find((message) => message.role === 'assistant'),
)

const diceAvailable = computed(() => {
  const last = messages.value[messages.value.length - 1]
  return Boolean(last && last.role === 'assistant' && last.diceRequest)
})

const hasMessages = computed(() => messages.value.length > 0)

const contextTokens = computed(() => usage.value?.total ?? 0)
const reasoningTokens = computed(() => usage.value?.reasoning ?? 0)

function requestScroll(target: string) {
  scrollTarget.value = target
  scrollNonce.value++
}

function persistMessages() {
  saveMessages(messages.value)
}

function systemPrompt(): string {
  return buildSystemPrompt(settings, gameState.value)
}

function showOptions(index: number): boolean {
  const message = messages.value[index]
  return Boolean(
    message &&
      index === messages.value.length - 1 &&
      message.role === 'assistant' &&
      !message.diceRequest &&
      message.options.length > 0,
  )
}

function friendlyError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 401) {
      return 'La API key fue rechazada. Revísala en Ajustes.'
    }
    if (error.code === 429) {
      return 'El modelo está saturado. Espera un momento e intenta de nuevo.'
    }
    if (/tardó demasiado/i.test(error.message)) {
      return 'El modelo tardó demasiado. Con razonamiento max puede pasar; prueba con xhigh o high.'
    }
    if (/context|longitud|too long|maximum context/i.test(error.message)) {
      return 'El historial supera la ventana del modelo. Recorta la partida o empieza una nueva.'
    }
    return error.message
  }
  return 'No se pudo contactar al modelo. Revisa la key y la conexión.'
}

async function generateResponse() {
  if (loading.value) return
  if (requiresApiKey(settings.baseUrl) && !settings.apiKey.trim()) {
    settingsOpen.value = true
    return
  }
  loading.value = true
  escribiendo.value = false
  errorMessage.value = ''

  const prompt = systemPrompt()
  const history = [...messages.value]
  try {
    const result = await chatWithFallback(settings, prompt, history)
    let assistant = createMessage('assistant', result.content)

    if (!assistant.options.length && !assistant.diceRequest) {
      try {
        const repairHistory = [
          ...history,
          assistant,
          createMessage('user', INSTRUCCION_REPARACION),
        ]
        const repairContent = await requestMissingOptions(settings, prompt, repairHistory)
        if (repairContent) {
          const repair = createMessage('assistant', repairContent)
          const repaired = prepareRepairContent(assistant, repair)
          if (repaired) assistant = repaired
        }
      } catch (repairError) {
        console.warn('No se pudieron completar las opciones', repairError)
      }
    }

    messages.value = [...messages.value, assistant]
    gameState.value = mergeState(gameState.value, assistant.state)
    usage.value = result.usage
    persistMessages()
    saveState(gameState.value)
    saveUsage(usage.value)
    requestScroll(assistant.id)
    if (settings.autoRead) {
      void speak(assistant, true)
    }
  } catch (error) {
    errorMessage.value = friendlyError(error)
  } finally {
    loading.value = false
  }
}

async function send(text: string) {
  if (loading.value) return
  const clean = text.trim()
  if (!clean) return
  if (requiresApiKey(settings.baseUrl) && !settings.apiKey.trim()) {
    settingsOpen.value = true
    return
  }
  const userMessage = createMessage('user', clean)
  messages.value = [...messages.value, userMessage]
  persistMessages()
  requestScroll('bottom')
  await generateResponse()
}

function startAdventure() {
  if (loading.value) return
  void send(`<Comienza la campaña. Presenta la escena inicial para ${settings.character}.>`)
}

function newGame() {
  stopSpeech()
  messages.value = []
  gameState.value = ''
  usage.value = null
  errorMessage.value = ''
  escribiendo.value = false
  diceGroups.value = defaultDice()
  clearGameStorage()
  requestScroll('bottom')
  diceOpen.value = false
  contextOpen.value = false
}

function saveConfig(next: Settings) {
  const modelChanged = next.model !== settings.model || next.baseUrl !== settings.baseUrl
  Object.assign(settings, next)
  saveSettings(settings)
  if (modelChanged) {
    usage.value = null
    saveUsage(null)
  }
  settingsOpen.value = false
  void loadVoices()
}

function updateMemory(memory: string) {
  gameState.value = memory.trim()
  saveState(gameState.value)
}

function setAutoRead(value: boolean) {
  settings.autoRead = value
  saveSettings(settings)
}

function openDice() {
  if (requiresApiKey(settings.baseUrl) && !settings.apiKey.trim()) {
    settingsOpen.value = true
    return
  }
  if (!diceAvailable.value) return
  diceGroups.value = loadDiceGroups() ?? diceGroups.value
  diceOpen.value = true
}

function closeDice(save = true) {
  if (save) saveDiceGroups(diceGroups.value)
  diceOpen.value = false
}

async function confirmDice(requests: DiceRequest[]) {
  const rolls = requests.map((request) =>
    rollDice(request.sides, request.count, request.bonus),
  )
  const message = messageFor(rolls)
  clearDiceGroups()
  diceGroups.value = defaultDice()
  diceOpen.value = false
  await send(message)
}

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
    settings.browserVoice &&
    !all.some((voice) => voice.voiceURI === settings.browserVoice)
  ) {
    settings.browserVoice = ''
    saveSettings(settings)
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

function loadVoices() {
  refreshBrowserVoices()
}

function stopSpeech() {
  speechToken++
  if (utterance && typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
    utterance = null
  }
  speakingId.value = null
  ttsPaused.value = false
}

function speak(message: ChatMessage, auto = false): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    ttsError.value = 'Este navegador no soporta la voz del sistema.'
    return false
  }
  const synth = window.speechSynthesis
  if (speakingId.value === message.id && utterance) {
    if (synth.paused) {
      synth.resume()
      ttsPaused.value = false
    } else {
      synth.pause()
      ttsPaused.value = true
    }
    return true
  }
  stopSpeech()
  const token = speechToken
  const text = cleanForSpeech(message.display)
  if (!text) return false
  const player = new SpeechSynthesisUtterance(text)
  const selected = settings.browserVoice
    ? browserVoices.value.find((voice) => voice.voiceURI === settings.browserVoice)
    : null
  const voice = selected ?? bestBrowserVoice()
  if (voice) {
    player.voice = voice
    player.lang = voice.lang
  } else {
    player.lang = 'es-CO'
  }
  player.rate = 1
  player.pitch = 1
  player.onend = () => {
    if (token !== speechToken) return
    utterance = null
    speakingId.value = null
    ttsPaused.value = false
  }
  player.onerror = (event) => {
    if (token !== speechToken) return
    const code = (event as SpeechSynthesisErrorEvent).error
    if (code === 'interrupted' || code === 'canceled') return
    ttsError.value = auto
      ? 'El navegador bloqueó la lectura automática. Toca el altavoz del mensaje.'
      : 'No se pudo reproducir la voz del navegador.'
    stopSpeech()
  }
  utterance = player
  speakingId.value = message.id
  ttsPaused.value = false
  ttsError.value = ''
  synth.speak(player)
  return true
}

function toggleSpeech(message: ChatMessage) {
  void speak(message)
}

function toggleWriting() {
  escribiendo.value = !escribiendo.value
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString('es', { maximumFractionDigits: 1 })}M`
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toLocaleString('es', { maximumFractionDigits: 1 })}k`
  }
  return value.toLocaleString('es')
}

function formatNumber(value: number): string {
  return value.toLocaleString('es')
}

function diceNotation(request: DiceRequest): string {
  return notation(request.sides, request.count, request.bonus)
}

function diceSummary(requests: DiceRequest[]): string {
  return joinWithAnd(requests.map(diceNotation))
}

function exportProgress() {
  downloadProgress(
    serializeProgress(
      settings,
      messages.value,
      gameState.value,
      usage.value,
      diceGroups.value,
    ),
  )
}

async function importProgress(file: File) {
  if (loading.value) {
    throw new Error('Espera a que el Dungeon Master termine el turno antes de importar.')
  }
  const data = await parseProgressFile(file)
  stopSpeech()
  Object.assign(settings, data.settings)
  saveSettings(settings)
  messages.value = data.messages.map((message) =>
    createMessage(message.role, message.content),
  )
  gameState.value = data.state
  usage.value = data.usage
  diceGroups.value = data.dice.length ? data.dice : defaultDice()
  escribiendo.value = false
  errorMessage.value = ''
  saveMessages(messages.value)
  saveState(gameState.value)
  saveUsage(usage.value)
  saveDiceGroups(diceGroups.value)
  refreshBrowserVoices()
  requestScroll(messages.value.length ? messages.value[messages.value.length - 1].id : 'bottom')
  settingsOpen.value = requiresApiKey(settings.baseUrl) && !settings.apiKey.trim()
}

async function init() {
  if (initialized) return
  initialized = true
  if (requiresApiKey(settings.baseUrl) && !settings.apiKey.trim()) {
    settingsOpen.value = true
  }
  if (messages.value.length) {
    requestScroll(messages.value[messages.value.length - 1].id)
  }
  refreshBrowserVoices()
  void loadVoices()
}

export function useGame() {
  return {
    settings,
    messages,
    gameState,
    usage,
    loading,
    escribiendo,
    draft,
    errorMessage,
    settingsOpen,
    diceOpen,
    contextOpen,
    diceGroups,
    browserVoices,
    speakingId,
    ttsPaused,
    ttsError,
    scrollTarget,
    scrollNonce,
    lastAssistant,
    diceAvailable,
    hasMessages,
    contextTokens,
    reasoningTokens,
    init,
    send,
    startAdventure,
    newGame,
    saveConfig,
    updateMemory,
    setAutoRead,
    exportProgress,
    importProgress,
    openDice,
    closeDice,
    confirmDice,
    loadVoices,
    stopSpeech,
    speak,
    toggleSpeech,
    toggleWriting,
    showOptions,
    formatTokens,
    formatNumber,
    diceNotation,
    diceSummary,
    generateResponse,
    requestScroll,
    persistMessages,
  }
}
