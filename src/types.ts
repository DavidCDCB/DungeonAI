export type Role = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: Role
  content: string
  display: string
  options: string[]
  state: string
  diceRequest: boolean
}

export type Reasoning = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface Settings {
  apiKey: string
  baseUrl: string
  model: string
  reasoning: Reasoning
  theme: string
  world: string
  character: string
  characterClass: string
  race: string
  browserVoice: string
  autoRead: boolean
}

export interface TokenUsage {
  prompt: number
  completion: number
  total: number
  cached: number
  reasoning: number
  estimated: boolean
  sentMessages: number
}

export interface DiceGroup {
  die: string
  count: string
  bonus: string
}

export interface DiceRequest {
  sides: number
  count: number
  bonus: number
}

export interface DiceRoll extends DiceRequest {
  values: number[]
  total: number
  notation: string
  detail: string
  message: string
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  baseUrl: '/api/opencode',
  model: 'claude-haiku-5-5',
  reasoning: 'high',
  theme: 'Alta Fantasía',
  world: 'Faerûn (Reinos Olvidados)',
  character: 'Sabrina',
  characterClass: 'Maga',
  race: 'Humana',
  browserVoice: '',
  autoRead: true,
}

export const REASONING_LEVELS: Reasoning[] = ['low', 'medium', 'high', 'xhigh', 'max']
