import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/types'
import { createMessage } from '../src/lib/messages'
import { serializeProgress } from '../src/lib/transfer'
import {
  CLOUD_APP,
  CLOUD_VERSION,
  cloudPath,
  formatSyncCode,
  isValidSyncCode,
  newSyncCode,
  normalizeSyncCode,
  parseCloudSnapshot,
} from '../src/lib/cloud'

describe('Código de sincronización', () => {
  it('genera 32 caracteres hexadecimales', () => {
    const code = newSyncCode()
    expect(code).toMatch(/^[a-f0-9]{32}$/)
    expect(isValidSyncCode(code)).toBe(true)
    expect(newSyncCode()).not.toBe(code)
  })

  it('normaliza mayúsculas, guiones y espacios', () => {
    const code = 'A1B2-C3D4 E5F6a7b8c9d0e1f2a3b4c5d6'
    expect(normalizeSyncCode(code)).toBe('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6')
  })

  it('rechaza códigos incompletos o con caracteres no hexadecimales', () => {
    expect(isValidSyncCode('')).toBe(false)
    expect(isValidSyncCode('a'.repeat(31))).toBe(false)
    expect(isValidSyncCode('z'.repeat(32))).toBe(false)
  })

  it('los muestra en grupos de 8 para copiarlo a mano', () => {
    expect(formatSyncCode('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6')).toBe(
      'a1b2c3d4-e5f6a7b8-c9d0e1f2-a3b4c5d6',
    )
  })

  it('no construye rutas con códigos inválidos', () => {
    expect(() => cloudPath('../../secreto')).toThrow(/no es válido/i)
  })
})

describe('Snapshot de la nube', () => {
  const progress = serializeProgress(
    { ...DEFAULT_SETTINGS, apiKey: 'sk-no-debe-salir' },
    [createMessage('user', 'Entro a la taberna.')],
    'Vida: 8',
    null,
    [],
    { includeApiKey: false },
  )

  it('parsea un progreso válido y conserva la marca de tiempo', () => {
    const parsed = parseCloudSnapshot({
      app: CLOUD_APP,
      version: CLOUD_VERSION,
      updatedAt: 123,
      progress,
    })
    expect(parsed?.updatedAt).toBe(123)
    expect(parsed?.progress.state).toBe('Vida: 8')
    expect(parsed?.progress.messages).toHaveLength(1)
    expect(parsed?.progress.settings.apiKey).toBe('')
  })

  it('rechaza datos de otra app o sin progreso', () => {
    expect(parseCloudSnapshot(null)).toBeNull()
    expect(parseCloudSnapshot({ app: 'otra', progress })).toBeNull()
    expect(parseCloudSnapshot({ app: CLOUD_APP })).toBeNull()
  })
})
