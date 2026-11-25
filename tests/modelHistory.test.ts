import { describe, expect, it } from 'vitest'
import {
  MODEL_HISTORY_LIMIT,
  normalizeModelHistory,
  rememberModel,
  suggestModels,
  type ModelHistoryEntry,
} from '../src/lib/modelHistory'

const OPENAI = 'https://api.openai.com/v1'
const OPENROUTER = 'https://openrouter.ai/api/v1'

describe('Historial de modelos', () => {
  it('añade un modelo y lo deja el primero', () => {
    const history = rememberModel([], 'gpt-5', OPENAI, 10)
    expect(history).toEqual([{ model: 'gpt-5', baseUrl: OPENAI, lastUsed: 10 }])
  })

  it('mueve al principio un modelo ya usado y evita duplicados', () => {
    let history = rememberModel([], 'gpt-5', OPENAI, 10)
    history = rememberModel(history, 'gpt-4.1', OPENAI, 20)
    history = rememberModel(history, 'GPT-5', OPENAI, 30)
    expect(history.map((item) => item.model)).toEqual(['GPT-5', 'gpt-4.1'])
    expect(history[0].lastUsed).toBe(30)
  })

  it('no reescribe si el modelo ya está el primero', () => {
    const history = rememberModel([], 'gpt-5', OPENAI, 10)
    expect(rememberModel(history, 'gpt-5', OPENAI, 20)).toBe(history)
  })

  it('separa los modelos por proveedor', () => {
    let history = rememberModel([], 'gpt-5', OPENAI, 10)
    history = rememberModel(history, 'anthropic/claude', OPENROUTER, 20)
    expect(suggestModels(history, OPENAI, '').map((item) => item.model)).toEqual(['gpt-5'])
    expect(suggestModels(history, OPENROUTER, '').map((item) => item.model)).toEqual([
      'anthropic/claude',
    ])
  })

  it('sugiere solo los modelos que empiezan por el texto escrito', () => {
    let history = rememberModel([], 'gpt-5', OPENAI, 10)
    history = rememberModel(history, 'gpt-4.1-mini', OPENAI, 20)
    history = rememberModel(history, 'o3', OPENAI, 30)
    expect(suggestModels(history, OPENAI, 'gp').map((item) => item.model)).toEqual([
      'gpt-4.1-mini',
      'gpt-5',
    ])
    expect(suggestModels(history, OPENAI, 'gpt-5').map((item) => item.model)).toEqual(['gpt-5'])
    expect(suggestModels(history, OPENAI, 'zzz')).toEqual([])
  })

  it('ignora modelos o URLs vacías', () => {
    expect(rememberModel([], '   ', OPENAI)).toEqual([])
    expect(rememberModel([], 'gpt-5', '   ')).toEqual([])
  })

  it('limita el historial y conserva los más recientes', () => {
    let history: ModelHistoryEntry[] = []
    for (let index = 0; index < MODEL_HISTORY_LIMIT + 5; index++) {
      history = rememberModel(history, `modelo-${index}`, OPENAI, index)
    }
    expect(history).toHaveLength(MODEL_HISTORY_LIMIT)
    expect(history[0].model).toBe(`modelo-${MODEL_HISTORY_LIMIT + 4}`)
  })
})

describe('Normalización del historial', () => {
  it('descarta entradas inválidas, normaliza la URL y quita duplicados', () => {
    const history = normalizeModelHistory([
      { model: 'gpt-5', baseUrl: `${OPENAI}/`, lastUsed: 10 },
      { model: 'GPT-5', baseUrl: OPENAI, lastUsed: 20 },
      { model: '', baseUrl: OPENAI, lastUsed: 30 },
      { model: 'o3', baseUrl: '', lastUsed: 40 },
      { model: 'o3', baseUrl: OPENAI, lastUsed: 'no' },
      null,
      'texto',
    ])
    expect(history).toEqual([{ model: 'GPT-5', baseUrl: OPENAI, lastUsed: 20 }])
  })

  it('devuelve vacío si el valor no es una lista', () => {
    expect(normalizeModelHistory(null)).toEqual([])
    expect(normalizeModelHistory({ model: 'gpt-5' })).toEqual([])
  })
})
