import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // Keep loopback TLS deadlines independent of other files' worker startup.
    // Every file remains isolated; assertions and request/test timeouts stay intact.
    maxWorkers: 1,
  },
})
