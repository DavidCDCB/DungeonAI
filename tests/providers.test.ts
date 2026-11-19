import { describe, expect, it } from 'vitest'
import {
  PROVIDERS,
  isOpenCodeBase,
  normalizeBaseUrl,
  providerFor,
  requiresApiKey,
} from '../src/lib/providers'

describe('Proveedores', () => {
  it('reconoce OpenCode como opción por defecto', () => {
    expect(PROVIDERS[0].id).toBe('opencode')
    expect(providerFor('/api/opencode').id).toBe('opencode')
    expect(isOpenCodeBase('/api/opencode')).toBe(true)
  })

  it('reconoce proveedores conocidos', () => {
    expect(providerFor('https://api.openai.com/v1').id).toBe('openai')
    expect(providerFor('https://api.deepseek.com/v1/').id).toBe('deepseek')
    expect(providerFor('http://localhost:11434/v1').id).toBe('ollama')
  })

  it('trata cualquier URL desconocida como personalizada', () => {
    expect(providerFor('https://modelos.ejemplo.com/v1').id).toBe('custom')
  })

  it('no exige key en servidores locales', () => {
    expect(requiresApiKey('http://localhost:1234/v1')).toBe(false)
    expect(requiresApiKey('http://192.168.1.50:8080/v1')).toBe(false)
  })

  it('exige key en servicios remotos', () => {
    expect(requiresApiKey('https://api.openai.com/v1')).toBe(true)
    expect(requiresApiKey('/api/opencode')).toBe(true)
    expect(requiresApiKey('')).toBe(true)
  })

  it('normaliza slash final y endpoint completo', () => {
    expect(normalizeBaseUrl('  https://api.openai.com/v1/  ')).toBe('https://api.openai.com/v1')
    expect(normalizeBaseUrl('https://api.openai.com/v1/chat/completions')).toBe(
      'https://api.openai.com/v1',
    )
    expect(providerFor('https://api.groq.com/openai/v1/chat/completions').id).toBe('groq')
  })
})
