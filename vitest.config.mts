import { defineConfig } from 'vitest/config'

// These exercise real socket deadlines, proxy/SSH processes, or calendar timing.
// Keep them alone on the host while each file runs.
const serialFiles = [
  'calendar-performance', 'node-management', 'node-wsl', 'sharing-network', 'termrail-ssh', 'update-transport',
].map(name => `tests/unit/${name}.test.ts`)

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'serial', include: serialFiles, maxWorkers: 1, sequence: { groupOrder: 1 } } },
      { test: {
        name: 'unit', include: ['tests/unit/**/*.test.ts'], exclude: serialFiles,
        maxWorkers: 3, sequence: { groupOrder: 2 },
      } },
    ],
  },
})
