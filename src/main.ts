import { createApp } from 'vue'
import './style.css'
import { initStorage } from './lib/storage'

/**
 * La partida vive en IndexedDB (asíncrono): se carga entera antes de montar la app,
 * que luego lee de memoria. App se importa después para que useGame vea los datos.
 */
async function bootstrap() {
  await initStorage()
  const { default: App } = await import('./App.vue')
  createApp(App).mount('#app')
}

void bootstrap()
