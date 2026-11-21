import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/types'
import { createMessage } from '../src/lib/messages'
import { serializeProgress } from '../src/lib/transfer'
import {
  CLOUD_APP,
  CLOUD_POLL_MS,
  CLOUD_REQUEST_TIMEOUT_MS,
  CLOUD_VERSION,
  backends,
  readCloudSnapshot,
  watchCloudSnapshot,
  writeCloudSnapshot,
} from '../src/lib/cloud'

const CODE = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
const BASE = 'https://demo-default-rtdb.firebaseio.com'
const URL = `${BASE}/saves/${CODE}.json`
const progress = serializeProgress(DEFAULT_SETTINGS, [createMessage('user', 'hola')], 'Dinero: 5 PO', null, [])
const snapshotOf = (updatedAt: number) => ({ progress, updatedAt })

function reply(body: unknown, status = 200): Response {
  return new Response(body === undefined ? '' : JSON.stringify(body), { status })
}

describe('Nube por HTTPS (API REST de Realtime Database)', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    // La barra final de la URL no debe duplicarse en la ruta.
    vi.stubEnv('VITE_FIREBASE_DATABASE_URL', `${BASE}/`)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('lee una partida y devuelve null si no existe', async () => {
    fetchMock.mockResolvedValueOnce(reply({ app: CLOUD_APP, version: CLOUD_VERSION, updatedAt: 123, progress }))
    const snapshot = await readCloudSnapshot(CODE)
    expect(fetchMock.mock.calls[0][0]).toBe(URL)
    expect(snapshot?.updatedAt).toBe(123)
    expect(snapshot?.progress.messages).toHaveLength(1)

    fetchMock.mockResolvedValueOnce(reply(null))
    expect(await readCloudSnapshot(CODE)).toBeNull()
  })

  it('ignora lo que no es una partida de la app', async () => {
    fetchMock.mockResolvedValueOnce(reply({ app: 'otra-cosa', progress }))
    expect(await readCloudSnapshot(CODE)).toBeNull()
  })

  it('guarda con PUT y devuelve la marca de tiempo', async () => {
    fetchMock.mockResolvedValueOnce(reply({}))
    const at = await writeCloudSnapshot(CODE, progress)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(URL)
    expect(init.method).toBe('PUT')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.cache).toBe('no-store')
    const body = JSON.parse(init.body)
    expect(body).toMatchObject({ app: CLOUD_APP, version: CLOUD_VERSION, updatedAt: at })
    expect(body.progress.state).toBe('Dinero: 5 PO')
    expect(body.progress.settings.apiKey ?? '').toBe('')
  })

  it('consulta solo la marca de tiempo', async () => {
    fetchMock.mockResolvedValueOnce(reply(1700000000000))
    expect(await backends.updatedAtOf(CODE)).toBe(1700000000000)
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/saves/${CODE}/updatedAt.json`)
    fetchMock.mockResolvedValueOnce(reply(null))
    expect(await backends.updatedAtOf(CODE)).toBe(0)
  })

  it('rechaza un código inválido sin llamar a la red', async () => {
    await expect(readCloudSnapshot('no-es-un-codigo')).rejects.toThrow(/código/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sin la URL configurada falla con un mensaje claro', async () => {
    vi.stubEnv('VITE_FIREBASE_DATABASE_URL', '')
    await expect(readCloudSnapshot(CODE)).rejects.toThrow(/configuración de Firebase/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('las reglas que rechazan se distinguen de los fallos de red', async () => {
    fetchMock.mockResolvedValueOnce(reply({ error: 'Permission denied' }, 401))
    await expect(readCloudSnapshot(CODE)).rejects.toThrow(/permission denied/)
    fetchMock.mockResolvedValueOnce(reply({ error: 'x' }, 400))
    await expect(readCloudSnapshot(CODE)).rejects.not.toThrow(/network/)
  })

  it('un 5xx o un fallo de conexión se marcan como fallo de red', async () => {
    fetchMock.mockResolvedValueOnce(reply({}, 503))
    await expect(readCloudSnapshot(CODE)).rejects.toThrow(/network/)
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(readCloudSnapshot(CODE)).rejects.toThrow(/network.*Failed to fetch/)
  })

  it('si no responde en el tiempo límite se aborta como fallo de red', async () => {
    vi.useFakeTimers()
    try {
      fetchMock.mockImplementationOnce(
        (_url: string, init: RequestInit) =>
          new Promise((_, reject) =>
            init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))),
          ),
      )
      const pending = readCloudSnapshot(CODE).catch((error: Error) => error)
      await vi.advanceTimersByTimeAsync(CLOUD_REQUEST_TIMEOUT_MS + 10)
      const error = (await pending) as Error
      expect(error.message).toMatch(new RegExp(`network.*${CLOUD_REQUEST_TIMEOUT_MS / 1000} s`))
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('el límite y el sondeo tienen valores razonables para el móvil', () => {
    expect(CLOUD_REQUEST_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000)
    expect(CLOUD_REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(30_000)
    expect(CLOUD_POLL_MS).toBe(45_000)
  })
})

describe('Aviso de cambios por sondeo', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('descarga la partida solo cuando cambia la marca de tiempo', async () => {
    let remote = 100
    vi.spyOn(backends, 'updatedAtOf').mockImplementation(async () => remote)
    const read = vi.spyOn(backends, 'read').mockImplementation(async () => snapshotOf(remote) as never)
    const seen: number[] = []
    const stop = watchCloudSnapshot(CODE, { onSnapshot: (snapshot) => snapshot && seen.push(snapshot.updatedAt) }, 1000)

    await vi.advanceTimersByTimeAsync(10)
    expect(seen).toEqual([100])
    await vi.advanceTimersByTimeAsync(2500)
    expect(seen).toEqual([100]) // sin cambios: no vuelve a descargar
    expect(read).toHaveBeenCalledTimes(1)

    remote = 200
    await vi.advanceTimersByTimeAsync(1100)
    expect(seen).toEqual([100, 200])

    stop()
    remote = 300
    await vi.advanceTimersByTimeAsync(5000)
    expect(seen).toEqual([100, 200])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('un fallo de red puntual no corta el sondeo ni se notifica como error', async () => {
    const updated = vi.spyOn(backends, 'updatedAtOf')
    updated.mockRejectedValueOnce(new Error('network: x'))
    updated.mockResolvedValue(50)
    vi.spyOn(backends, 'read').mockResolvedValue(snapshotOf(50) as never)
    const seen: number[] = []
    const errors: unknown[] = []
    const stop = watchCloudSnapshot(CODE, { onSnapshot: (s) => s && seen.push(s.updatedAt), onError: (e) => errors.push(e) }, 1000)
    await vi.advanceTimersByTimeAsync(10)
    expect(seen).toEqual([])
    await vi.advanceTimersByTimeAsync(1100)
    expect(seen).toEqual([50])
    expect(errors).toEqual([])
    stop()
  })

  it('un rechazo de las reglas sí se notifica', async () => {
    vi.spyOn(backends, 'updatedAtOf').mockRejectedValue(new Error('permission denied (HTTP 401)'))
    const errors: unknown[] = []
    const stop = watchCloudSnapshot(CODE, { onSnapshot: () => undefined, onError: (e) => errors.push(e) }, 1000)
    await vi.advanceTimersByTimeAsync(10)
    expect(errors).toHaveLength(1)
    stop()
  })

  it('se pausa con la pestaña oculta', async () => {
    const updated = vi.spyOn(backends, 'updatedAtOf').mockResolvedValue(10)
    vi.spyOn(backends, 'read').mockResolvedValue(snapshotOf(10) as never)
    const page = { visibilityState: 'hidden' }
    vi.stubGlobal('document', page)
    const stop = watchCloudSnapshot(CODE, { onSnapshot: () => undefined }, 1000)
    await vi.advanceTimersByTimeAsync(3500)
    expect(updated).not.toHaveBeenCalled()
    page.visibilityState = 'visible'
    await vi.advanceTimersByTimeAsync(1100)
    expect(updated).toHaveBeenCalled()
    stop()
    vi.unstubAllGlobals()
  })
})
