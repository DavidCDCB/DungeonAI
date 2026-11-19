import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/types'
import type { ChatMessage, DiceGroup, Settings, TokenUsage } from '../src/types'
import { createMessage } from '../src/lib/messages'
import {
  PROGRESS_APP,
  PROGRESS_VERSION,
  parseProgressJson,
  serializeProgress,
} from '../src/lib/transfer'

const settings: Settings = {
  ...DEFAULT_SETTINGS,
  apiKey: 'sk-prueba',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4.1-mini',
  reasoning: 'medium',
  character: 'Sabrina',
}

const messages: ChatMessage[] = [
  createMessage('user', 'Entro a la cueva.'),
  createMessage('assistant', 'La oscuridad te envuelve.'),
]

const usage: TokenUsage = {
  prompt: 1200,
  completion: 340,
  total: 1540,
  cached: 0,
  reasoning: 210,
  estimated: false,
  sentMessages: 2,
}

const dice: DiceGroup[] = [{ die: 'd20', count: '2', bonus: '3' }]

describe('Transferencia de progreso', () => {
  it('exporta e importa la partida completa', () => {
    const file = serializeProgress(settings, messages, '[ESTADO]\nVida: 10', usage, dice)
    expect(file.app).toBe(PROGRESS_APP)
    expect(file.version).toBe(PROGRESS_VERSION)
    expect(file.messages).toHaveLength(2)

    const restored = parseProgressJson(JSON.stringify(file))
    expect(restored.settings).toEqual(settings)
    expect(restored.messages).toEqual([
      { role: 'user', content: 'Entro a la cueva.' },
      { role: 'assistant', content: 'La oscuridad te envuelve.' },
    ])
    expect(restored.state).toBe('[ESTADO]\nVida: 10')
    expect(restored.usage).toEqual(usage)
    expect(restored.dice).toEqual(dice)
  })

  it('rechaza archivos que no son de la app', () => {
    expect(() => parseProgressJson('{}')).toThrow(/no es un progreso/i)
  })

  it('rechaza JSON inválido', () => {
    expect(() => parseProgressJson('no-json')).toThrow(/JSON válido/i)
  })

  it('rechaza versiones futuras', () => {
    const payload = JSON.stringify({ app: PROGRESS_APP, version: 99, messages: [] })
    expect(() => parseProgressJson(payload)).toThrow(/versión/i)
  })

  it('normaliza ajustes y descarta mensajes inválidos', () => {
    const payload = JSON.stringify({
      app: PROGRESS_APP,
      version: 1,
      messages: [
        { role: 'user', content: 'hola' },
        { role: 'system', content: 'ignorado' },
        { role: 'assistant', content: 42 },
      ],
      settings: { reasoning: 'imposible', autoRead: 'sí' },
    })
    const restored = parseProgressJson(payload)
    expect(restored.messages).toEqual([{ role: 'user', content: 'hola' }])
    expect(restored.settings.reasoning).toBe(DEFAULT_SETTINGS.reasoning)
    expect(restored.settings.autoRead).toBe(true)
    expect(restored.settings.baseUrl).toBe(DEFAULT_SETTINGS.baseUrl)
    expect(restored.usage).toBeNull()
    expect(restored.dice).toEqual([])
  })
})
