import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const OPENCODE_UPSTREAM = 'https://opencode.ai/inference/go/openai/v1'

const proxy = {
  '/api/opencode': {
    target: OPENCODE_UPSTREAM,
    changeOrigin: true,
    secure: true,
    rewrite: (path: string) => path.replace(/^\/api\/opencode/, ''),
    headers: {
      'User-Agent': 'dungeon-ai-web/1.0',
    },
  },
}

/**
 * Copia vercel.json a dist/ sin las opciones de build. Así `dist/` se puede
 * arrastrar tal cual a Vercel Drop (sitio estático) y conserva el proxy
 * /api/opencode y las cabeceras.
 */
function vercelStaticConfig(): Plugin {
  return {
    name: 'dungeon-ai:vercel-static-config',
    apply: 'build',
    generateBundle() {
      const config = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'))
      for (const key of ['framework', 'installCommand', 'buildCommand', 'outputDirectory']) {
        delete config[key]
      }
      this.emitFile({
        type: 'asset',
        fileName: 'vercel.json',
        source: `${JSON.stringify(config, null, 2)}\n`,
      })
    },
  }
}

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        id: '/',
        name: 'Dungeon AI — Dungeon Master con IA',
        short_name: 'Dungeon AI',
        description:
          'Partidas de rol en español con un Dungeon Master de IA: narración, opciones, dados, memoria persistente y voz.',
        lang: 'es',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#0b0a0e',
        background_color: '#0b0a0e',
        categories: ['games', 'entertainment'],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Chrome en Android muestra un diálogo de instalación enriquecido con estas capturas.
        screenshots: [
          {
            src: 'screenshots/mobile-partida.jpg',
            sizes: '814x1808',
            type: 'image/jpeg',
            form_factor: 'narrow',
            label: 'Narración del Dungeon Master con cinco opciones de acción',
          },
          {
            src: 'screenshots/desktop-partida.jpg',
            sizes: '1280x720',
            type: 'image/jpeg',
            form_factor: 'wide',
            label: 'Partida en escritorio con el panel de personaje y memoria',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        globIgnores: ['**/screenshots/**'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
    }),
    vercelStaticConfig(),
  ],
  build: {
    target: 'es2022',
  },
  server: {
    port: 5173,
    proxy,
  },
  preview: {
    port: 4173,
    proxy,
  },
})
