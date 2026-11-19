import type { ChatMessage, DiceGroup, Settings, TokenUsage } from '../types'
import { normalizeDiceGroups } from './dice'
import { createMessage } from './messages'
import { normalizeSettings } from './transfer'

const PREFIX = 'dungeon-ai-web:'

function write(key: string, value: string | null): boolean {
  try {
    if (value === null) localStorage.removeItem(`${PREFIX}${key}`)
    else localStorage.setItem(`${PREFIX}${key}`, value)
    return true
  } catch {
    // localStorage lleno o no disponible
    return false
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(`${PREFIX}${key}`)
  } catch {
    return null
  }
}

export function loadSettings(defaults: Settings): Settings {
  const raw = read('settings')
  if (!raw) return { ...defaults }
  try {
    return normalizeSettings({ ...defaults, ...(JSON.parse(raw) as Partial<Settings>) })
  } catch {
    return { ...defaults }
  }
}

export function saveSettings(settings: Settings): boolean {
  return write('settings', JSON.stringify(settings))
}

interface StoredMessage {
  role?: string
  content?: string
  memory?: unknown
}

export function toStoredMessage(message: ChatMessage): StoredMessage {
  const stored: StoredMessage = { role: message.role, content: message.content }
  if (message.role === 'assistant' && typeof message.memory === 'string') {
    stored.memory = message.memory
  }
  return stored
}

export function fromStoredMessage(item: StoredMessage): ChatMessage | null {
  if (item?.role !== 'user' && item?.role !== 'assistant') return null
  const message = createMessage(item.role, String(item.content ?? ''))
  if (item.role === 'assistant' && typeof item.memory === 'string') {
    message.memory = item.memory
  }
  return message
}

export function loadMessages(): ChatMessage[] {
  const raw = read('messages')
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as StoredMessage[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(fromStoredMessage)
      .filter((message): message is ChatMessage => message !== null)
  } catch {
    return []
  }
}

export function saveMessages(messages: ChatMessage[]): boolean {
  return write('messages', JSON.stringify(messages.map(toStoredMessage)))
}

export function loadState(): string {
  return read('state') ?? ''
}

export function saveState(state: string): boolean {
  return write('state', state.trim() ? state : null)
}

export function loadUsage(): TokenUsage | null {
  const raw = read('usage')
  if (!raw) return null
  try {
    return JSON.parse(raw) as TokenUsage
  } catch {
    return null
  }
}

export function saveUsage(usage: TokenUsage | null): boolean {
  return write('usage', usage ? JSON.stringify(usage) : null)
}

export function loadDiceGroups(): DiceGroup[] | null {
  const raw = read('dice')
  if (!raw) return null
  try {
    const groups = normalizeDiceGroups(JSON.parse(raw))
    return groups.length ? groups : null
  } catch {
    return null
  }
}

export function saveDiceGroups(groups: DiceGroup[]): boolean {
  return write('dice', JSON.stringify(groups))
}

export function clearDiceGroups(): boolean {
  return write('dice', null)
}

export function loadDraft(): string {
  return read('draft') ?? ''
}

export function saveDraft(draft: string): boolean {
  return write('draft', draft ? draft : null)
}

export function clearGameStorage(): boolean {
  return ['messages', 'state', 'usage', 'dice', 'draft']
    .map((key) => write(key, null))
    .every(Boolean)
}

/** Bytes aproximados que ocupa la app en localStorage (UTF-16). */
export function storageBytes(): number {
  try {
    let total = 0
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith(PREFIX)) continue
      total += (key.length + (localStorage.getItem(key)?.length ?? 0)) * 2
    }
    return total
  } catch {
    return 0
  }
}
