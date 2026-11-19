import type { ChatMessage, DiceGroup, Role, Settings, TokenUsage } from '../types'
import { DEFAULT_SETTINGS, REASONING_LEVELS } from '../types'

export const PROGRESS_APP = 'dungeon-ai-web'
export const PROGRESS_VERSION = 1
const MAX_IMPORT_BYTES = 25 * 1024 * 1024
const MAX_MESSAGES = 5000

export interface ProgressMessage {
  role: Role
  content: string
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

export function serializeProgress(
  settings: Settings,
  messages: ChatMessage[],
  state: string,
  usage: TokenUsage | null,
  dice: DiceGroup[],
): ProgressFile {
  return {
    app: PROGRESS_APP,
    version: PROGRESS_VERSION,
    exportedAt: new Date().toISOString(),
    settings: { ...settings },
    messages: messages.map(({ role, content }) => ({ role, content })),
    state,
    usage,
    dice: dice.map((group) => ({ ...group })),
  }
}

export function downloadProgress(progress: ProgressFile): void {
  const json = JSON.stringify(progress, null, 2)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  const date = new Date().toISOString().slice(0, 10)
  anchor.href = url
  anchor.download = `dungeon-ai-progreso-${date}.json`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
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
    .map((message: any) => ({
      role: message.role as Role,
      content: String(message.content),
    }))

  return {
    app: PROGRESS_APP,
    version,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
    settings: normalizeSettings(raw.settings),
    messages,
    state: typeof raw.state === 'string' ? raw.state : '',
    usage: normalizeUsage(raw.usage),
    dice: normalizeDice(raw.dice),
  }
}

function normalizeSettings(value: any): Settings {
  const raw = value && typeof value === 'object' ? value : {}
  const text = (key: keyof Settings, fallback: string): string => {
    const candidate = raw[key]
    return typeof candidate === 'string' ? candidate : fallback
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
    autoRead: typeof raw.autoRead === 'boolean' ? raw.autoRead : true,
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

function normalizeDice(value: any): DiceGroup[] {
  if (!Array.isArray(value)) return []
  return value
    .slice(0, 10)
    .filter((group: any) => group && typeof group.die === 'string')
    .map((group: any) => ({
      die: String(group.die),
      count: typeof group.count === 'string' ? group.count : String(group.count ?? '1'),
      bonus: typeof group.bonus === 'string' ? group.bonus : String(group.bonus ?? '0'),
    }))
}
