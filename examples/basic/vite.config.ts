import { defineConfig } from 'vite'

import mapMouthwash from '../../src/index.js'

export default defineConfig({
  base: './',
  plugins: [
    mapMouthwash({
      languages: ['ar', 'en', 'es', 'fr', 'ru'],
      report: true,
    }),
  ],
  build: {
    emptyOutDir: true,
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name][extname]',
        chunkFileNames: 'assets/[name].js',
        entryFileNames: 'assets/index.js',
      },
    },
    sourcemap: true,
  },
})
