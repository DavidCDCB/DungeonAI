import type {
  ChatMessage,
  DiceGroup,
  ReadingFont,
  Role,
  Settings,
  TextSize,
  TokenUsage,
} from '../types'
import { DEFAULT_SETTINGS, REASONING_LEVELS } from '../types'
import { normalizeDiceGroups } from './dice'

export const PROGRESS_APP = 'dungeon-ai-web'
export const PROGRESS_VERSION = 1
const MAX_IMPORT_BYTES = 25 * 1024 * 1024
const MAX_MESSAGES = 5000

export interface ProgressMessage {
  role: Role
  content: string
  memory?: string
}

export interface ProgressFile {
  app: string
  version: number
  exportedAt: string
  settings: Settings
  messages: ProgressMessage[]
  state: string
  usage: TokenUsage | null
  dice: DiceGroup[]
}

export interface SerializeOptions {
  /** Incluir la API key en el archivo (texto plano). */
  includeApiKey?: boolean
}

export function serializeProgress(
  settings: Settings,
  messages: ChatMessage[],
  state: string,
  usage: TokenUsage | null,
  dice: DiceGroup[],
  options: SerializeOptions = {},
): ProgressFile {
  const includeApiKey = options.includeApiKey ?? true
  return {
    app: PROGRESS_APP,
    version: PROGRESS_VERSION,
    exportedAt: new Date().toISOString(),
    settings: { ...settings, apiKey: includeApiKey ? settings.apiKey : '' },
    messages: messages.map((message) => {
      const item: ProgressMessage = { role: message.role, content: message.content }
      if (message.role === 'assistant' && typeof message.memory === 'string') {
        item.memory = message.memory
      }
      return item
    }),
    state,
    usage,
    dice: dice.map((group) => ({ ...group })),
  }
}

export function progressFileName(settings: Settings, date = new Date()): string {
  const slug = settings.character
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const day = date.toISOString().slice(0, 10)
  return `dungeon-ai-${slug || 'partida'}-${day}.json`
}

export function downloadProgress(progress: ProgressFile): void {
  const json = JSON.stringify(progress, null, 2)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = progressFileName(progress.settings)
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

export async function parseProgressFile(file: File): Promise<ProgressFile> {
  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error('El archivo es demasiado grande.')
  }
  const text = await file.text()
  return parseProgressJson(text)
}

export function parseProgressJson(text: string): ProgressFile {
  let raw: any
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('El archivo no es un JSON válido.')
  }
  if (!raw || typeof raw !== 'object' || raw.app !== PROGRESS_APP) {
    throw new Error('El archivo no es un progreso de Dungeon AI.')
  }
  const version = Number(raw.version ?? 0)
  if (!Number.isInteger(version) || version < 1 || version > PROGRESS_VERSION) {
    throw new Error('La versión del archivo no es compatible.')
  }
  if (!Array.isArray(raw.messages)) {
    throw new Error('El archivo no contiene mensajes válidos.')
  }
  const messages: ProgressMessage[] = raw.messages
    .slice(0, MAX_MESSAGES)
    .filter(
      (message: any) =>
        message &&
        (message.role === 'user' || message.role === 'assistant') &&
        typeof message.content === 'string',
    )
    .map((message: any) => {
      const item: ProgressMessage = {
        role: message.role as Role,
        content: String(message.content),
      }
      if (message.role === 'assistant' && typeof message.memory === 'string') {
        item.memory = message.memory
      }
      return item
    })

  return {
    app: PROGRESS_APP,
    version,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
    settings: normalizeSettings(raw.settings),
    messages,
    state: typeof raw.state === 'string' ? raw.state : '',
    usage: normalizeUsage(raw.usage),
    dice: normalizeDiceGroups(raw.dice),
  }
}

const TEXT_SIZES: TextSize[] = ['sm', 'md', 'lg']
const READING_FONTS: ReadingFont[] = ['serif', 'sans']

export function normalizeSettings(value: any): Settings {
  const raw = value && typeof value === 'object' ? value : {}
  const text = (key: keyof Settings, fallback: string): string => {
    const candidate = raw[key]
    return typeof candidate === 'string' ? candidate : fallback
  }
  const bool = (key: keyof Settings, fallback: boolean): boolean => {
    const candidate = raw[key]
    return typeof candidate === 'boolean' ? candidate : fallback
  }
  const number = (key: keyof Settings, fallback: number, min: number, max: number): number => {
    const candidate = Number(raw[key])
    return Number.isFinite(candidate) && candidate >= min && candidate <= max ? candidate : fallback
  }
  const reasoning = REASONING_LEVELS.includes(raw.reasoning)
    ? raw.reasoning
    : DEFAULT_SETTINGS.reasoning
  return {
    apiKey: text('apiKey', ''),
    baseUrl: text('baseUrl', DEFAULT_SETTINGS.baseUrl) || DEFAULT_SETTINGS.baseUrl,
    model: text('model', DEFAULT_SETTINGS.model) || DEFAULT_SETTINGS.model,
    reasoning,
    theme: text('theme', DEFAULT_SETTINGS.theme),
    world: text('world', DEFAULT_SETTINGS.world),
    character: text('character', DEFAULT_SETTINGS.character),
    characterClass: text('characterClass', DEFAULT_SETTINGS.characterClass),
    race: text('race', DEFAULT_SETTINGS.race),
    browserVoice: text('browserVoice', ''),
    autoRead: bool('autoRead', DEFAULT_SETTINGS.autoRead),
    stream: bool('stream', DEFAULT_SETTINGS.stream),
    contextWindow: Math.round(
      number('contextWindow', DEFAULT_SETTINGS.contextWindow, 4_000, 10_000_000),
    ),
    speechRate: number('speechRate', DEFAULT_SETTINGS.speechRate, 0.5, 2),
    textSize: TEXT_SIZES.includes(raw.textSize) ? raw.textSize : DEFAULT_SETTINGS.textSize,
    readingFont: READING_FONTS.includes(raw.readingFont)
      ? raw.readingFont
      : DEFAULT_SETTINGS.readingFont,
    showSecrets: bool('showSecrets', DEFAULT_SETTINGS.showSecrets),
  }
}

function normalizeUsage(value: any): TokenUsage | null {
  if (!value || typeof value !== 'object') return null
  const number = (candidate: any): number => {
    const parsed = Number(candidate)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
  }
  const prompt = number(value.prompt)
  const completion = number(value.completion)
  const total = number(value.total) || prompt + completion
  if (total <= 0) return null
  return {
    prompt,
    completion,
    total,
    cached: number(value.cached),
    reasoning: number(value.reasoning),
    estimated: Boolean(value.estimated),
    sentMessages: number(value.sentMessages),
  }
}
