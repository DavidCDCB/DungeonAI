import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { clear, createStore, entries } from 'idb-keyval'
import { reactive } from 'vue'
import { DEFAULT_SETTINGS, type TokenUsage } from '../src/types'
import { createMessage } from '../src/lib/messages'
import {
  clearDiceGroups,
  clearGameStorage,
  initStorage,
  loadCloudSettings,
  loadDiceGroups,
  loadDraft,
  loadMessages,
  loadSettings,
  loadState,
  loadUsage,
  resetStorageForTests,
  saveCloudSettings,
  saveDiceGroups,
  saveDraft,
  saveMessages,
  saveSettings,
  saveState,
  saveUsage,
  storageBytes,
  whenSaved,
} from '../src/lib/storage'

const USAGE = { prompt: 1, completion: 2, reasoning: 0, total: 3 } as unknown as TokenUsage

/** localStorage mínimo para simular los datos de versiones anteriores. */
function fakeLocal(data: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(data))
  return {
    get length() {
      return map.size
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
  }
}

const rawStore = () => createStore('dungeon-ai-web', 'kv')

async function rawRecords(): Promise<Map<string, unknown>> {
  return new Map(await entries<string, unknown>(rawStore()))
}

/** Vacía la base entre pruebas (borrarla quedaría bloqueada por las conexiones abiertas). */
async function freshDb() {
  await whenSaved()
  resetStorageForTests()
  await clear(rawStore())
}

/** Simula cerrar y volver a abrir la app. */
async function restart(legacy: Storage | null = fakeLocal()) {
  await whenSaved()
  resetStorageForTests()
  await initStorage(legacy)
}

beforeEach(freshDb)

describe('Persistencia en IndexedDB', () => {
  it('arranca vacío con los valores por defecto', async () => {
    await initStorage(fakeLocal())
    expect(loadMessages()).toEqual([])
    expect(loadState()).toBe('')
    expect(loadUsage()).toBeNull()
    expect(loadDiceGroups()).toBeNull()
    expect(loadDraft()).toBe('')
    expect(loadSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS)
  })

  it('lo guardado sobrevive a un reinicio (relectura desde IndexedDB)', async () => {
    await initStorage(fakeLocal())
    const messages = [createMessage('user', 'Entro a la taberna'), createMessage('assistant', 'Huele a humo.')]
    const settings = { ...DEFAULT_SETTINGS, world: 'Eberron', lore: '## Premisa\nTexto largo', loreReasoning: 'high' as const }
    expect(await saveSettings(settings)).toBe(true)
    expect(await saveMessages(messages)).toBe(true)
    expect(await saveState('Dinero: 5 PO')).toBe(true)
    expect(await saveUsage(USAGE)).toBe(true)
    expect(await saveDiceGroups([{ die: 'd20', count: '2', bonus: '3' }])).toBe(true)
    expect(await saveDraft('mi borrador')).toBe(true)

    await restart()
    expect(loadMessages().map((m) => [m.id, m.role, m.content])).toEqual(
      messages.map((m) => [m.id, m.role, m.content]),
    )
    const loaded = loadSettings(DEFAULT_SETTINGS)
    expect(loaded.world).toBe('Eberron')
    expect(loaded.lore).toBe('## Premisa\nTexto largo')
    expect(loaded.loreReasoning).toBe('high')
    expect(loadState()).toBe('Dinero: 5 PO')
    expect(loadUsage()?.total).toBe(3)
    expect(loadDiceGroups()).toEqual([{ die: 'd20', count: '2', bonus: '3' }])
    expect(loadDraft()).toBe('mi borrador')
  })

  it('guarda el código de sincronización aparte y no lo borra al reiniciar la partida', async () => {
    await initStorage(fakeLocal())
    expect(loadCloudSettings()).toEqual({ enabled: false, code: '' })
    const code = 'a'.repeat(32)
    expect(await saveCloudSettings({ enabled: true, code })).toBe(true)

    await restart()
    expect(loadCloudSettings()).toEqual({ enabled: true, code })

    await clearGameStorage()
    expect(loadCloudSettings()).toEqual({ enabled: true, code })
  })

  it('guarda cada mensaje como un registro y solo escribe lo que cambió', async () => {
    await initStorage(fakeLocal())
    const a = createMessage('user', 'uno')
    const b = createMessage('assistant', 'dos')
    await saveMessages([a, b])
    let records = await rawRecords()
    expect([...records.keys()].filter((key) => key.startsWith('msg:')).sort()).toEqual(
      [`msg:${a.id}`, `msg:${b.id}`].sort(),
    )
    expect(records.get('messages')).toEqual([a.id, b.id])

    // Se altera el registro de «a» directamente en la base: un guardado posterior
    // que no lo toca no debe reescribirlo.
    await rawStore()('readwrite', (os) => {
      os.put({ id: a.id, role: 'user', content: 'MARCA' }, `msg:${a.id}`)
      return new Promise<void>((resolve) => {
        os.transaction.oncomplete = () => resolve()
      })
    })
    const c = createMessage('user', 'tres')
    await saveMessages([a, b, c])
    records = await rawRecords()
    expect((records.get(`msg:${a.id}`) as { content: string }).content).toBe('MARCA')
    expect((records.get(`msg:${c.id}`) as { content: string }).content).toBe('tres')
    expect(records.get('messages')).toEqual([a.id, b.id, c.id])
  })

  it('detecta mensajes editados y elimina los quitados', async () => {
    await initStorage(fakeLocal())
    const a = createMessage('user', 'uno')
    const b = createMessage('assistant', 'dos')
    const c = createMessage('user', 'tres')
    await saveMessages([a, b, c])

    const edited = { ...b, content: 'dos (editado)', memory: 'Dinero: 1 PO' }
    await saveMessages([a, edited])
    const records = await rawRecords()
    expect(records.has(`msg:${c.id}`)).toBe(false)
    expect((records.get(`msg:${b.id}`) as { memory: string }).memory).toBe('Dinero: 1 PO')
    expect(records.get('messages')).toEqual([a.id, b.id])

    await restart()
    expect(loadMessages().map((m) => m.content)).toEqual(['uno', 'dos (editado)'])
    expect(loadMessages()[1].memory).toBe('Dinero: 1 PO')
  })

  it('las escrituras seguidas se agrupan y llegan en orden', async () => {
    await initStorage(fakeLocal())
    const list = [createMessage('user', '1')]
    const writes = [saveMessages(list)]
    for (let i = 2; i <= 30; i++) {
      list.push(createMessage(i % 2 ? 'user' : 'assistant', String(i)))
      writes.push(saveMessages(list))
    }
    expect((await Promise.all(writes)).every(Boolean)).toBe(true)
    await restart()
    expect(loadMessages().map((m) => m.content)).toEqual(list.map((m) => m.content))
  })

  it('«nueva partida» borra la partida pero conserva los ajustes', async () => {
    await initStorage(fakeLocal())
    await saveSettings({ ...DEFAULT_SETTINGS, world: 'Eberron' })
    await saveMessages([createMessage('user', 'hola')])
    await saveState('Dinero: 1 PO')
    await saveDraft('x')
    await saveDiceGroups([{ die: 'd6', count: '1', bonus: '0' }])
    await saveUsage(USAGE)
    expect(await clearGameStorage()).toBe(true)
    await clearDiceGroups()
    await restart()
    expect(loadMessages()).toEqual([])
    expect(loadState()).toBe('')
    expect(loadDraft()).toBe('')
    expect(loadUsage()).toBeNull()
    expect(loadDiceGroups()).toBeNull()
    expect(loadSettings(DEFAULT_SETTINGS).world).toBe('Eberron')
    const keys = [...(await rawRecords()).keys()]
    expect(keys.filter((key) => key.startsWith('msg:'))).toEqual([])
  })

  it('estima el espacio ocupado', async () => {
    await initStorage(fakeLocal())
    const empty = storageBytes()
    await saveMessages([createMessage('user', 'a'.repeat(1000))])
    expect(storageBytes()).toBeGreaterThan(empty + 2000)
  })

  it('guarda objetos reactivos (copias planas) sin error de clonado', async () => {
    await initStorage(fakeLocal())
    expect(await saveSettings(reactive({ ...DEFAULT_SETTINGS, world: 'Proxy' }))).toBe(true)
    expect(await saveUsage(reactive({ ...USAGE }) as TokenUsage)).toBe(true)
  })

  it('usar el almacenamiento antes de initStorage() falla con un error claro', () => {
    expect(() => loadMessages()).toThrow(/initStorage/)
  })
})

describe('Migración desde localStorage', () => {
  const legacy = () =>
    fakeLocal({
      'dungeon-ai-web:settings': JSON.stringify({ world: 'Skyrim', lore: '## Premisa\nTamriel', apiKey: 'sk-1' }),
      'dungeon-ai-web:messages': JSON.stringify([
        { role: 'user', content: 'Hola' },
        { role: 'assistant', content: 'Bienvenido.', memory: 'Dinero: 5 PO' },
        { role: 'system', content: 'ignorado' },
      ]),
      'dungeon-ai-web:state': 'Dinero: 5 PO',
      'dungeon-ai-web:usage': JSON.stringify({ prompt: 1, completion: 2, reasoning: 0, total: 3 }),
      'dungeon-ai-web:dice': JSON.stringify([{ die: 'd8', count: '1', bonus: '2' }]),
      'dungeon-ai-web:draft': 'seguir',
      'otra-app:clave': 'no tocar',
    })

  it('importa ajustes, partida, memoria, dados y borrador, y limpia el origen', async () => {
    const source = legacy()
    await initStorage(source)
    const messages = loadMessages()
    expect(messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'Hola'],
      ['assistant', 'Bienvenido.'],
    ])
    expect(messages[1].memory).toBe('Dinero: 5 PO')
    const settings = loadSettings(DEFAULT_SETTINGS)
    expect(settings.world).toBe('Skyrim')
    expect(settings.lore).toBe('## Premisa\nTamriel')
    expect(settings.apiKey).toBe('sk-1')
    expect(loadState()).toBe('Dinero: 5 PO')
    expect(loadUsage()?.total).toBe(3)
    expect(loadDiceGroups()).toEqual([{ die: 'd8', count: '1', bonus: '2' }])
    expect(loadDraft()).toBe('seguir')

    // Quedó en IndexedDB y se borró el origen (sin tocar claves ajenas).
    expect(source.getItem('dungeon-ai-web:messages')).toBeNull()
    expect(source.getItem('dungeon-ai-web:settings')).toBeNull()
    expect(source.getItem('otra-app:clave')).toBe('no tocar')
    expect([...(await rawRecords()).keys()].filter((key) => key.startsWith('msg:'))).toHaveLength(2)

    // Y los datos migrados persisten al reiniciar, con los mismos ids.
    const ids = messages.map((m) => m.id)
    await restart(null)
    expect(loadMessages().map((m) => m.id)).toEqual(ids)
  })

  it('migra una sola vez: tras vaciar IndexedDB no «resucita» el localStorage', async () => {
    await initStorage(legacy())
    await clearGameStorage()
    await restart(legacy())
    expect(loadMessages()).toEqual([])
    expect(loadDraft()).toBe('')
  })

  it('tolera datos antiguos corruptos', async () => {
    await initStorage(
      fakeLocal({
        'dungeon-ai-web:settings': '{no es json',
        'dungeon-ai-web:messages': '42',
        'dungeon-ai-web:usage': '[]',
      }),
    )
    expect(loadMessages()).toEqual([])
    expect(loadUsage()).toBeNull()
    expect(loadSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS)
  })

  it('funciona sin localStorage', async () => {
    await initStorage(null)
    expect(loadMessages()).toEqual([])
  })
})
