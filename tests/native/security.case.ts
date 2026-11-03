import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { ipcMain } from 'electron'
import { app } from 'electron'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createWindow } from '../../src/main/window'
import type { NativeCase } from './helpers'
export const cases: NativeCase[] = [
  {
    name: 'isolates the real renderer and exposes only eight bridge methods',
    async run(ctx) {
      assert.ok(
        app
          .getPath('userData')
          .startsWith(join(tmpdir(), 'simple-timeline-native-profile-')),
      )
      const checkedPreload = join(ctx.tempDir, 'security-preload.cjs')
      writeFileSync(
        checkedPreload,
        readFileSync('out/preload/index.cjs', 'utf8') +
          `\nrequire('electron').ipcRenderer.send('__native_flags',{sandboxed:process.sandboxed,isolated:process.contextIsolated});`,
      )
      const flags = new Promise((resolve) =>
        ipcMain.once('__native_flags', (_event, value) => resolve(value)),
      )
      ctx.defer(() => ipcMain.removeAllListeners('__native_flags'))
      const w = createWindow(
        checkedPreload,
        pathToFileURL(resolve('out/renderer/index.html')).href,
      )
      ctx.defer(() => {
        if (!w.isDestroyed()) w.destroy()
      })
      await new Promise<void>((r, j) => {
        w.webContents.once('did-finish-load', () => r())
        w.webContents.once('did-fail-load', (_e, code, message) =>
          j(Error(`${code}: ${message}`)),
        )
      })
      assert.deepEqual(await flags, { sandboxed: true, isolated: true })
      const result = await w.webContents.executeJavaScript(
        '({node:typeof require, keys:Object.keys(window.simpleTimeline||{})})',
      )
      assert.equal(result.node, 'undefined')
      assert.equal(result.keys.length, 8)
      assert.equal(result.keys.includes('invoke'), false)
    },
  },
]
