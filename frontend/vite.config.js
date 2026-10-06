import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react({
    include: "**/*.{jsx,tsx,js,ts}", // Allow JSX in .js files
  })],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'build',
    sourcemap: process.env.NODE_ENV !== 'production',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    maxWorkers: 8, // cap workers: the default oversubscribes 16 cores and heavy jsdom/MUI renders time out
  },
  define: {
    // For compatibility with some libraries that expect process.env
    global: 'globalThis',
  },
})