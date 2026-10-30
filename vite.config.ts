import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { realpathSync } from 'node:fs'

// `@anclora/design-system` is a linked package whose real path lies outside the project root (and outside the
// QA overlay used by `npm run dev`); Vite refuses to serve its fonts unless that real path is allowed.
const linkedRoots = ['node_modules', 'node_modules/@anclora/design-system'].flatMap((entry) => {
  try { return [realpathSync(entry)] } catch { return [] }
})

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    fs: { allow: [process.cwd(), ...linkedRoots] },
    watch: {
      // E2E artifacts (traces/results) must not trigger page reloads mid-test.
      ignored: ['**/qa/**'],
    },
    proxy: {
      '/health': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
