export type Role = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: Role
  content: string
  display: string
  options: string[]
  state: string
  diceRequest: boolean
  /** Memoria completa tras este turno (solo DM). Permite deshacer y regenerar turnos. */
  memory?: string
}

export type Reasoning = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type TextSize = 'sm' | 'md' | 'lg'
export type ReadingFont = 'serif' | 'sans'

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
  /** Prompt del Dungeon Master. Vacío = usar el prompt original. */
  customPrompt: string
  browserVoice: string
  autoRead: boolean
  /** Muestra la respuesta del DM mientras se escribe (SSE). */
  stream: boolean
  /** Ventana de contexto del modelo, en tokens. */
  contextWindow: number
  speechRate: number
  textSize: TextSize
  readingFont: ReadingFont
  /** Muestra la sección "Trama (solo DM)" de la memoria. */
  showSecrets: boolean
  /** Contexto del mundo (lore): base de conocimiento que se añade al prompt. */
  lore: string
  /** Esfuerzo de razonamiento al generar el lore o aplicarle la plantilla. */
  loreReasoning: Reasoning
}

export interface TokenUsage {
  prompt: number
  completion: number
  total: number
  cached: number
  reasoning: number
  estimated: boolean
  sentMessages: number
  /** Tokens de salida por segundo desde el primer token recibido (solo con streaming). */
  tokensPerSecond?: number
  /** Duración total del turno, en ms. */
  durationMs?: number
}

export type DiceMode = 'normal' | 'advantage' | 'disadvantage' | 'drop-lowest'

export interface DiceGroup {
  die: string
  count: string
  bonus: string
  mode?: DiceMode
}

export interface DiceRequest {
  sides: number
  count: number
  bonus: number
  mode?: DiceMode
}

export interface DiceRoll extends DiceRequest {
  values: number[]
  /** Dados que cuentan para el total (sin el descartado). */
  kept: number[]
  total: number
  notation: string
  detail: string
  message: string
  /** Resultado natural de un d20 único (crítico/pifia). */
  natural: number | null
}

export type TurnPhase = 'idle' | 'memory' | 'waiting' | 'thinking' | 'writing'

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
  customPrompt: '',
  browserVoice: '',
  autoRead: true,
  stream: true,
  contextWindow: 1_000_000,
  speechRate: 1,
  textSize: 'md',
  readingFont: 'serif',
  showSecrets: false,
  lore: '',
  loreReasoning: 'medium',
}

export const REASONING_LEVELS: Reasoning[] = ['low', 'medium', 'high', 'xhigh', 'max']

export const CONTEXT_WINDOWS: Array<{ value: number; label: string }> = [
  { value: 32_000, label: '32k' },
  { value: 128_000, label: '128k' },
  { value: 200_000, label: '200k' },
  { value: 400_000, label: '400k' },
  { value: 1_000_000, label: '1M' },
]
