import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/firebase', () => ({
  cloudConfigured: true,
  firebaseConfig: { databaseURL: 'https://demo-default-rtdb.firebaseio.com/' },
  loadDatabase: () => Promise.resolve(null),
}))

import { DEFAULT_SETTINGS } from '../src/types'
import { createMessage } from '../src/lib/messages'
import { serializeProgress } from '../src/lib/transfer'
import {
  CLOUD_APP,
  CLOUD_TIMEOUTS,
  CLOUD_VERSION,
  backends,
  cloudTransport,
  isNetworkFailure,
  pollCloudSnapshot,
  readCloudSnapshot,
  resetCloudTransport,
  writeCloudSnapshot,
} from '../src/lib/cloud'

const CODE = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
const URL = `https://demo-default-rtdb.firebaseio.com/saves/${CODE}.json`
const progress = serializeProgress(DEFAULT_SETTINGS, [createMessage('user', 'hola')], 'Dinero: 5 PO', null, [])
const snapshotOf = (updatedAt: number) => ({ progress, updatedAt })

function reply(body: unknown, status = 200): Response {
  return new Response(body === undefined ? '' : JSON.stringify(body), { status })
}

describe('Fallos de conexión frente a rechazos', () => {
  it('distingue la red de las reglas o los datos', () => {
    expect(isNetworkFailure(new Error('network: La lectura de Firebase no respondió en 8 s'))).toBe(true)
    expect(isNetworkFailure(new Error('Error: Client is offline'))).toBe(true)
    expect(isNetworkFailure(new Error('Failed to fetch'))).toBe(true)
    expect(isNetworkFailure(new Error('PERMISSION_DENIED: Permission denied'))).toBe(false)
    expect(isNetworkFailure(new Error('permission denied (HTTP 401)'))).toBe(false)
    expect(isNetworkFailure(new Error('Invalid data; keys must not contain "."'))).toBe(false)
    expect(isNetworkFailure(new Error('otra cosa'))).toBe(false)
  })
})

describe('API REST por HTTPS', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('lee una partida y devuelve null si no existe', async () => {
    fetchMock.mockResolvedValueOnce(reply({ app: CLOUD_APP, version: CLOUD_VERSION, updatedAt: 123, progress }))
    const snapshot = await backends.restRead(CODE)
    expect(fetchMock.mock.calls[0][0]).toBe(URL)
    expect(snapshot?.updatedAt).toBe(123)
    expect(snapshot?.progress.messages).toHaveLength(1)

    fetchMock.mockResolvedValueOnce(reply(null))
    expect(await backends.restRead(CODE)).toBeNull()
  })

  it('guarda con PUT el mismo formato que el SDK y devuelve la marca de tiempo', async () => {
    fetchMock.mockResolvedValueOnce(reply({}))
    const at = await backends.restWrite(CODE, progress)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(URL)
    expect(init.method).toBe('PUT')
    expect(init.headers['Content-Type']).toBe('application/json')
    const body = JSON.parse(init.body)
    expect(body).toMatchObject({ app: CLOUD_APP, version: CLOUD_VERSION, updatedAt: at })
    expect(body.progress.state).toBe('Dinero: 5 PO')
    expect(body.progress.settings.apiKey ?? '').toBe('')
  })

  it('consulta solo la marca de tiempo', async () => {
    fetchMock.mockResolvedValueOnce(reply(1700000000000))
    expect(await backends.restUpdatedAt(CODE)).toBe(1700000000000)
    expect(fetchMock.mock.calls[0][0]).toBe(`https://demo-default-rtdb.firebaseio.com/saves/${CODE}/updatedAt.json`)
    fetchMock.mockResolvedValueOnce(reply(null))
    expect(await backends.restUpdatedAt(CODE)).toBe(0)
  })

  it('las reglas que rechazan no son fallos de red', async () => {
    fetchMock.mockResolvedValueOnce(reply({ error: 'Permission denied' }, 401))
    const error = await backends.restRead(CODE).catch((e: Error) => e)
    expect((error as Error).message).toMatch(/permission denied/)
    expect(isNetworkFailure(error)).toBe(false)
  })

  it('un 5xx o un fallo de conexión sí lo son', async () => {
    fetchMock.mockResolvedValueOnce(reply({}, 503))
    expect(isNetworkFailure(await backends.restRead(CODE).catch((e) => e))).toBe(true)
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(isNetworkFailure(await backends.restRead(CODE).catch((e) => e))).toBe(true)
  })

  it('si no responde en el tiempo límite se aborta como fallo de red', async () => {
    vi.useFakeTimers()
    try {
      fetchMock.mockImplementationOnce(
        (_url: string, init: RequestInit) =>
          new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))),
      )
      const pending = backends.restRead(CODE).catch((e: Error) => e)
      await vi.advanceTimersByTimeAsync(CLOUD_TIMEOUTS.rest + 10)
      const error = await pending
      expect(isNetworkFailure(error)).toBe(true)
      expect((error as Error).message).toMatch(/HTTPS/)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('Cambio de camino: SDK → HTTPS', () => {
  beforeEach(() => resetCloudTransport())
  afterEach(() => vi.restoreAllMocks())

  it('si el SDK no conecta, lee por HTTPS, aparca el SDK y sigue por HTTPS', async () => {
    const sdk = vi.spyOn(backends, 'sdkRead').mockRejectedValue(new Error('network: La lectura de Firebase no respondió en 8 s'))
    const rest = vi.spyOn(backends, 'restRead').mockResolvedValue(snapshotOf(7) as never)
    const park = vi.spyOn(backends, 'parkSdk').mockResolvedValue()

    expect(cloudTransport()).toBe('sdk')
    expect((await readCloudSnapshot(CODE))?.updatedAt).toBe(7)
    expect(cloudTransport()).toBe('rest')
    expect(park).toHaveBeenCalledTimes(1)

    await readCloudSnapshot(CODE)
    expect(sdk).toHaveBeenCalledTimes(1) // ya no se vuelve a intentar con el SDK en esta sesión
    expect(rest).toHaveBeenCalledTimes(2)
  })

  it('el guardado también pasa a HTTPS', async () => {
    vi.spyOn(backends, 'sdkWrite').mockRejectedValue(new Error('network: El guardado en Firebase no respondió en 10 s'))
    const rest = vi.spyOn(backends, 'restWrite').mockResolvedValue(99)
    vi.spyOn(backends, 'parkSdk').mockResolvedValue()
    expect(await writeCloudSnapshot(CODE, progress)).toBe(99)
    expect(rest).toHaveBeenCalledWith(CODE, progress)
    expect(cloudTransport()).toBe('rest')
  })

  it('un rechazo de las reglas no cambia de camino', async () => {
    vi.spyOn(backends, 'sdkWrite').mockRejectedValue(new Error('PERMISSION_DENIED: Permission denied'))
    const rest = vi.spyOn(backends, 'restWrite')
    await expect(writeCloudSnapshot(CODE, progress)).rejects.toThrow(/Permission denied/)
    expect(rest).not.toHaveBeenCalled()
    expect(cloudTransport()).toBe('sdk')
  })

  it('si tampoco hay HTTPS, el error llega a la interfaz', async () => {
    vi.spyOn(backends, 'sdkRead').mockRejectedValue(new Error('network: timeout'))
    vi.spyOn(backends, 'parkSdk').mockResolvedValue()
    vi.spyOn(backends, 'restRead').mockRejectedValue(new Error('network: no se pudo alcanzar Firebase por HTTPS (Failed to fetch)'))
    await expect(readCloudSnapshot(CODE)).rejects.toThrow(/HTTPS/)
  })
})

describe('Aviso de cambios sin el SDK (sondeo)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('descarga la partida solo cuando cambia la marca de tiempo', async () => {
    let remote = 100
    vi.spyOn(backends, 'restUpdatedAt').mockImplementation(async () => remote)
    const read = vi.spyOn(backends, 'restRead').mockImplementation(async () => snapshotOf(remote) as never)
    const seen: number[] = []
    const stop = pollCloudSnapshot(CODE, { onSnapshot: (s) => s && seen.push(s.updatedAt) }, 1000)

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
  })

  it('un fallo de red puntual no corta el sondeo', async () => {
    const updated = vi.spyOn(backends, 'restUpdatedAt')
    updated.mockRejectedValueOnce(new Error('network: x'))
    updated.mockResolvedValue(50)
    vi.spyOn(backends, 'restRead').mockResolvedValue(snapshotOf(50) as never)
    const seen: number[] = []
    const stop = pollCloudSnapshot(CODE, { onSnapshot: (s) => s && seen.push(s.updatedAt) }, 1000)
    await vi.advanceTimersByTimeAsync(10)
    expect(seen).toEqual([])
    await vi.advanceTimersByTimeAsync(1100)
    expect(seen).toEqual([50])
    stop()
  })
})
