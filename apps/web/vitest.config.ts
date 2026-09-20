import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

const root = fileURLToPath(new URL(".", import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.join(root, "src"),
    },
  },
  test: {
    environment: 'jsdom',
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['lcov', 'text'],
    }
  },
})
