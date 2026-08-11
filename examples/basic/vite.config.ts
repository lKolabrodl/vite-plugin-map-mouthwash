import { defineConfig } from 'vite'

import mapMouthwash from '../../src/index.js'

export default defineConfig({
  base: './',
  plugins: [mapMouthwash({ report: true })],
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
