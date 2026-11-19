import { watch, type Ref } from 'vue'

/**
 * Mantiene la pantalla encendida mientras `active` sea verdadero (el DM piensa,
 * escribe o lee en voz alta). Así el móvil no se bloquea en un turno largo.
 * El navegador libera el bloqueo al ocultar la página; se recupera al volver.
 */
export function useWakeLock(active: Ref<boolean>) {
  let sentinel: WakeLockSentinel | null = null
  let requesting = false

  async function acquire() {
    if (sentinel || requesting || !('wakeLock' in navigator)) return
    if (document.visibilityState !== 'visible') return
    requesting = true
    try {
      sentinel = await navigator.wakeLock.request('screen')
      sentinel.addEventListener('release', () => {
        sentinel = null
      })
      if (!active.value) await release()
    } catch {
      // Sin permiso, batería baja o navegador sin soporte: no pasa nada.
    } finally {
      requesting = false
    }
  }

  async function release() {
    const current = sentinel
    sentinel = null
    await current?.release().catch(() => undefined)
  }

  watch(active, (value) => (value ? void acquire() : void release()), { immediate: true })

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && active.value) void acquire()
    })
  }
}
