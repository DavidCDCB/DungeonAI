export interface ProviderPreset {
  id: string
  label: string
  baseUrl: string
  hint?: string
}

export const PROVIDERS: ProviderPreset[] = [
  {
    id: 'opencode',
    label: 'OpenCode (proxy local)',
    baseUrl: '/api/opencode',
    hint: 'Endpoint de OpenCode a través del proxy de Vite',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    hint: 'Requiere una key de OpenAI',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    hint: 'Requiere una key de OpenRouter',
  },
  {
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    hint: 'Requiere una key de Groq',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    hint: 'Requiere una key de DeepSeek',
  },
  {
    id: 'ollama',
    label: 'Ollama local',
    baseUrl: 'http://localhost:11434/v1',
    hint: 'Puede funcionar sin API key',
  },
  {
    id: 'lmstudio',
    label: 'LM Studio local',
    baseUrl: 'http://localhost:1234/v1',
    hint: 'Puede funcionar sin API key',
  },
  {
    id: 'custom',
    label: 'Personalizado',
    baseUrl: '',
    hint: 'Cualquier endpoint OpenAI-compatible',
  },
]

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/+$/, '')
}

export function providerFor(baseUrl: string): ProviderPreset {
  const value = normalizeBaseUrl(baseUrl)
  const found = PROVIDERS.find(
    (provider) => provider.id !== 'custom' && provider.baseUrl.replace(/\/+$/, '') === value,
  )
  return found ?? PROVIDERS[PROVIDERS.length - 1]
}

export function isOpenCodeBase(baseUrl: string): boolean {
  const value = normalizeBaseUrl(baseUrl)
  return value === '/api/opencode' || /opencode\.ai/i.test(value)
}

export function requiresApiKey(baseUrl: string): boolean {
  const value = normalizeBaseUrl(baseUrl)
  if (!value) return true
  if (isOpenCodeBase(value)) return true
  // Los proxies relativos suelen necesitar autenticación; los locales no.
  if (value.startsWith('/')) return true
  try {
    const host = new URL(value).hostname.toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') {
      return false
    }
    if (host.startsWith('10.') || host.startsWith('192.168.')) return false
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false
    return true
  } catch {
    return true
  }
}
