import { defineConfig, mergeConfig } from 'electron-vite'
import production from './electron.vite.config.mts'
import { resolve } from 'node:path'
export default mergeConfig(
  production,
  defineConfig({
    main: {
      build: {
        outDir: resolve('artifacts/test-app/main'),
        rollupOptions: { input: resolve('tests/e2e/main.ts') },
      },
    },
    preload: { build: { outDir: resolve('artifacts/test-app/preload') } },
    renderer: { build: { outDir: resolve('artifacts/test-app/renderer') } },
  }),
)
