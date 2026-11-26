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
    expect(restored.settings.customPrompt).toBe('')
    expect(restored.usage).toBeNull()
    expect(restored.dice).toEqual([])
  })
})

describe('Opciones de exportación', () => {
  it('puede omitir la API key y conserva las instantáneas de memoria', () => {
    const withMemory = [
      createMessage('user', 'Hola'),
      { ...createMessage('assistant', 'Bienvenida'), memory: 'Dinero: 5 PO' },
    ]
    const file = serializeProgress(settings, withMemory, '', null, [], { includeApiKey: false })
    expect(file.settings.apiKey).toBe('')
    const restored = parseProgressJson(JSON.stringify(file))
    expect(restored.messages[1]).toEqual({ role: 'assistant', content: 'Bienvenida', memory: 'Dinero: 5 PO' })
  })

  it('incluye el prompt personalizado al exportar e importar', () => {
    const withPrompt: Settings = {
      ...settings,
      customPrompt: 'Narra como un bardo sarcástico.',
    }
    const file = serializeProgress(withPrompt, [], '', null, [])
    expect(file.settings.customPrompt).toBe('Narra como un bardo sarcástico.')
    expect(parseProgressJson(JSON.stringify(file)).settings.customPrompt).toBe(
      'Narra como un bardo sarcástico.',
    )
  })

  it('normaliza los nuevos ajustes', () => {
    const restored = parseProgressJson(
      JSON.stringify({
        app: PROGRESS_APP,
        version: 1,
        messages: [],
        settings: { contextWindow: 5, speechRate: 9, textSize: 'xl', stream: false },
      }),
    )
    expect(restored.settings.contextWindow).toBe(DEFAULT_SETTINGS.contextWindow)
    expect(restored.settings.speechRate).toBe(DEFAULT_SETTINGS.speechRate)
    expect(restored.settings.textSize).toBe('md')
    expect(restored.settings.stream).toBe(false)
  })

  it('migra el esfuerzo único a Cronista y Opciones y valida cada agente', () => {
    const legacy = parseProgressJson(
      JSON.stringify({
        app: PROGRESS_APP,
        version: 1,
        messages: [],
        settings: { reasoning: 'max' },
      }),
    )
    expect(legacy.settings.reasoning).toBe('max')
    expect(legacy.settings.memoryReasoning).toBe('max')
    expect(legacy.settings.optionsReasoning).toBe('max')

    const custom = parseProgressJson(
      JSON.stringify({
        app: PROGRESS_APP,
        version: 1,
        messages: [],
        settings: { reasoning: 'high', memoryReasoning: 'low', optionsReasoning: 'max' },
      }),
    )
    expect(custom.settings.memoryReasoning).toBe('low')
    expect(custom.settings.optionsReasoning).toBe('max')

    const invalid = parseProgressJson(
      JSON.stringify({
        app: PROGRESS_APP,
        version: 1,
        messages: [],
        settings: { reasoning: 'high', memoryReasoning: 'ultra', optionsReasoning: 7 },
      }),
    )
    expect(invalid.settings.memoryReasoning).toBe('high')
    expect(invalid.settings.optionsReasoning).toBe('high')
  })
})

describe('Velocidad del turno', () => {
  it('conserva tokens por segundo y duración al exportar', () => {
    const fast = { ...usage, tokensPerSecond: 48.3, durationMs: 12_400 }
    const file = serializeProgress(settings, messages, '', fast, dice)
    expect(parseProgressJson(JSON.stringify(file)).usage).toEqual(fast)
  })
})
