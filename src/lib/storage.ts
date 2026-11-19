import type { ChatMessage, DiceGroup, Settings, TokenUsage } from '../types'
import { createMessage } from './messages'

const PREFIX = 'dungeon-ai-web:'

export function loadSettings(defaults: Settings): Settings {
  try {
    const raw = localStorage.getItem(`${PREFIX}settings`)
    if (!raw) return { ...defaults }
    const parsed = JSON.parse(raw) as Partial<Settings>
    return { ...defaults, ...parsed }
  } catch {
    return { ...defaults }
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(`${PREFIX}settings`, JSON.stringify(settings))
  } catch {
    // localStorage lleno o no disponible
  }
}

export function loadMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(`${PREFIX}messages`)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Array<{ role?: string; content?: string }>
    return parsed
      .filter((item) => item.role === 'user' || item.role === 'assistant')
      .map((item) => createMessage(item.role as 'user' | 'assistant', String(item.content ?? '')))
  } catch {
    return []
  }
}

export function saveMessages(messages: ChatMessage[]): void {
  try {
    localStorage.setItem(
      `${PREFIX}messages`,
      JSON.stringify(messages.map(({ role, content }) => ({ role, content }))),
    )
  } catch {
    // sin espacio
  }
}

export function loadState(): string {
  try {
    return localStorage.getItem(`${PREFIX}state`) ?? ''
  } catch {
    return ''
  }
}

export function saveState(state: string): void {
  try {
    if (state.trim()) localStorage.setItem(`${PREFIX}state`, state)
    else localStorage.removeItem(`${PREFIX}state`)
  } catch {
    // sin espacio
  }
}

export function loadUsage(): TokenUsage | null {
  try {
    const raw = localStorage.getItem(`${PREFIX}usage`)
    return raw ? (JSON.parse(raw) as TokenUsage) : null
  } catch {
    return null
  }
}

export function saveUsage(usage: TokenUsage | null): void {
  try {
    if (usage) localStorage.setItem(`${PREFIX}usage`, JSON.stringify(usage))
    else localStorage.removeItem(`${PREFIX}usage`)
  } catch {
    // sin espacio
  }
}

export function loadDiceGroups(): DiceGroup[] | null {
  try {
    const raw = localStorage.getItem(`${PREFIX}dice`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DiceGroup[]
    if (!Array.isArray(parsed) || !parsed.length) return null
    return parsed
      .filter((item) => typeof item?.die === 'string')
      .map((item) => ({
        die: item.die || 'd20',
        count: String(item.count ?? '1'),
        bonus: String(item.bonus ?? '0'),
      }))
  } catch {
    return null
  }
}

export function saveDiceGroups(groups: DiceGroup[]): void {
  try {
    localStorage.setItem(`${PREFIX}dice`, JSON.stringify(groups))
  } catch {
    // sin espacio
  }
}

export function clearDiceGroups(): void {
  try {
    localStorage.removeItem(`${PREFIX}dice`)
  } catch {
    // sin espacio
  }
}

export function clearGameStorage(): void {
  try {
    localStorage.removeItem(`${PREFIX}messages`)
    localStorage.removeItem(`${PREFIX}state`)
    localStorage.removeItem(`${PREFIX}usage`)
    localStorage.removeItem(`${PREFIX}dice`)
  } catch {
    // sin espacio
  }
}
