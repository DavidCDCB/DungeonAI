import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Genera los iconos PWA a partir de public/favicon.svg:
//   npm run icons
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: {
      ...minimal2023Preset.maskable,
      resizeOptions: { background: '#0b0a0e' },
    },
    apple: {
      ...minimal2023Preset.apple,
      resizeOptions: { background: '#0b0a0e' },
    },
  },
  images: ['public/favicon.svg'],
})
