import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    include: ['tests/ui/**/*.test.tsx'],
    environment: 'jsdom',
    // JSDOM/Radix suites contend under host-sized default worker counts on 4-CPU CI.
    maxWorkers: 1,
    setupFiles: ['tests/ui/setup.ts'],
    environmentOptions: { jsdom: { pretendToBeVisual: true } },
  },
})
