import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    include: ['tests/ui/**/*.test.tsx'],
    environment: 'jsdom',
    // Keep JSDOM files isolated and bound CPU contention on the 4-CPU CI runners.
    maxWorkers: 2,
    setupFiles: ['tests/ui/setup.ts'],
    environmentOptions: { jsdom: { pretendToBeVisual: true } },
  },
})
