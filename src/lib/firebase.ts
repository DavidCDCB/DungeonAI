import type { FirebaseOptions } from 'firebase/app'
import type { Database } from 'firebase/database'

/**
 * Configuración de Firebase leída del entorno. No se hardcodea ninguna clave:
 * el despliegue (o `.env.local`) decide si la nube está disponible.
 */
const env = import.meta.env
const apiKey = env.VITE_FIREBASE_API_KEY?.trim() ?? ''
const databaseURL = env.VITE_FIREBASE_DATABASE_URL?.trim() ?? ''
const projectId = env.VITE_FIREBASE_PROJECT_ID?.trim() ?? ''

export const cloudConfigured = Boolean(apiKey && databaseURL && projectId)

export const firebaseConfig: FirebaseOptions | null = cloudConfigured
  ? {
      apiKey,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN?.trim() || undefined,
      databaseURL,
      projectId,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET?.trim() || undefined,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim() || undefined,
      appId: env.VITE_FIREBASE_APP_ID?.trim() || undefined,
    }
  : null

let databasePromise: Promise<Database | null> | null = null

/**
 * Carga el SDK de Firebase solo cuando se usa la nube. Así la app principal no
 * paga el peso del SDK si el jugador nunca activa la sincronización.
 */
export function loadDatabase(): Promise<Database | null> {
  if (!firebaseConfig) return Promise.resolve(null)
  if (!databasePromise) {
    databasePromise = (async () => {
      const [{ getApp, getApps, initializeApp }, { getDatabase }] = await Promise.all([
        import('firebase/app'),
        import('firebase/database'),
      ])
      const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
      return getDatabase(app)
    })().catch((error) => {
      databasePromise = null
      throw error
    })
  }
  return databasePromise
}
