import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: resolve(projectRoot, 'src/renderer'),
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    hmr: {
      host: '127.0.0.1',
      clientPort: 4173
    }
  },
  resolve: {
    alias: {
      '@': resolve(projectRoot, 'src/renderer/src')
    }
  },
  build: {
    outDir: resolve(projectRoot, 'build'),
    emptyOutDir: true
  }
})
