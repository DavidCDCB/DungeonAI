import { ref } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { useToasts } from './useToasts'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine)
const canInstall = ref(false)
const installed = ref(false)
let deferredPrompt: BeforeInstallPromptEvent | null = null
let started = false

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

async function install(): Promise<boolean> {
  if (!deferredPrompt) return false
  const prompt = deferredPrompt
  deferredPrompt = null
  canInstall.value = false
  await prompt.prompt()
  const choice = await prompt.userChoice
  return choice.outcome === 'accepted'
}

/** Registra el service worker y escucha instalación y conectividad. Llamar una vez. */
function start() {
  if (started || typeof window === 'undefined') return
  started = true
  const { push } = useToasts()
  installed.value = isStandalone()

  window.addEventListener('online', () => {
    online.value = true
    push('Conexión recuperada.', { tone: 'success' })
  })
  window.addEventListener('offline', () => {
    online.value = false
    push('Sin conexión. Tu partida sigue guardada en este dispositivo.', { tone: 'warning' })
  })
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    canInstall.value = !installed.value
  })
  window.addEventListener('appinstalled', () => {
    installed.value = true
    canInstall.value = false
    deferredPrompt = null
    push('Dungeon AI quedó instalada como aplicación.', { tone: 'success' })
  })

  const { updateServiceWorker } = useRegisterSW({
    immediate: true,
    onNeedRefresh() {
      push('Hay una nueva versión de Dungeon AI.', {
        tone: 'info',
        timeout: 0,
        action: { label: 'Actualizar', run: () => void updateServiceWorker(true) },
      })
    },
    onOfflineReady() {
      push('Lista para abrirse sin conexión.', { tone: 'success' })
    },
    onRegisterError(error) {
      console.warn('No se pudo registrar el service worker', error)
    },
  })
}

export function usePwa() {
  return { online, canInstall, installed, install, start }
}
