import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'index.html'),
        approval: resolve(__dirname, 'approval.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
        content: resolve(__dirname, 'src/content/provider.ts'),
        inpage: resolve(__dirname, 'src/content/inpage.ts')
      },
      output: {
        entryFileNames: '[name].js'
      }
    }
  }
})
