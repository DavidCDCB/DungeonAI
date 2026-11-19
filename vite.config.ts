import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const proxy = {
  '/api/opencode': {
    target: 'https://opencode.ai/inference/go/openai/v1',
    changeOrigin: true,
    secure: true,
    rewrite: (path: string) => path.replace(/^\/api\/opencode/, ''),
    headers: {
      'User-Agent': 'dungeon-ai-web/1.0',
    },
  },
}

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    port: 5173,
    proxy,
  },
  preview: {
    port: 4173,
    proxy,
  },
})
