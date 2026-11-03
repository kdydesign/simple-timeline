import { app, dialog } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { initializeStorage, type StorageState } from './db/lifecycle'
import { profileDirectory } from './profile'
import { createWindow } from './window'
import { registerTimelineIpc } from './ipc'
import { resolveRendererUrl } from './ipc-core'
import { installCloseGuard } from './close'
import type { Result } from '../shared/types'
export interface BootstrapOptions {
  profileDir?: string
  rendererUrl?: string
  preloadPath?: string
  notifyBlocked?: (storage: StorageState) => void
  afterDispatch?: (
    method: string,
    result: Result<unknown>,
  ) => Result<unknown> | Promise<Result<unknown>>
  confirmClose?: () => Promise<boolean>
}
export async function bootstrap(options: BootstrapOptions = {}) {
  const profile = options.profileDir ?? profileDirectory(app.getPath('appData'))
  mkdirSync(profile, { recursive: true })
  app.setName('Simple Timeline')
  app.setPath('userData', profile)
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return null
  }
  await app.whenReady()
  const storage = await initializeStorage(profile)
  const rendererUrl =
    options.rendererUrl ??
    resolveRendererUrl(
      pathToFileURL(join(__dirname, '../renderer/index.html')).href,
      {
        packaged: app.isPackaged,
        development: process.env.NODE_ENV === 'development',
        devUrl: process.env.ELECTRON_RENDERER_URL,
      },
    )
  const window = createWindow(
    options.preloadPath ?? join(__dirname, '../preload/index.cjs'),
    rendererUrl,
  )
  const unregister = registerTimelineIpc(
    window,
    storage,
    rendererUrl,
    options.afterDispatch,
  )
  if (storage.state === 'blocked') {
    if (options.notifyBlocked) options.notifyBlocked(storage)
    else
      dialog.showErrorBox(
        '저장소를 열 수 없습니다',
        `${storage.error.message}\n원본을 보존합니다.\n${join(profile, 'data', 'timeline.sqlite3')}`,
      )
  }
  installCloseGuard(
    window,
    options.confirmClose ??
      (async () => {
        const result = await dialog.showMessageBox(window, {
          type: 'question',
          title: '변경 내용을 버리고 종료할까요?',
          message: '저장하지 않은 입력이 사라질 수 있습니다.',
          buttons: ['계속 편집', '변경 버리고 종료'],
          defaultId: 0,
          cancelId: 0,
        })
        return result.response === 1
      }),
  )
  app.on('second-instance', () => {
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  })
  app.on('window-all-closed', () => app.quit())
  app.on('will-quit', () => {
    unregister()
    if (storage.state === 'ready' && storage.db.open) storage.db.close()
  })
  return { window, storage, profile }
}
