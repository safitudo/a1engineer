import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Exclude the node:test-based E2E harness — it requires
    // `node --experimental-test-module-mocks` and is not vitest-compatible.
    exclude: ['**/node_modules/**', '**/e2e/**'],
  },
})
