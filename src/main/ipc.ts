import { ipcMain, type BrowserWindow } from 'electron'
import type { StorageState } from './db/lifecycle'
import { channels } from '../shared/api'
import { dispatch, isTrustedSender } from './ipc-core'
import type { Result } from '../shared/types'
export function registerTimelineIpc(
  window: BrowserWindow,
  storage: StorageState,
  allowedUrl: string,
  afterDispatch?: (
    method: string,
    result: Result<unknown>,
  ) => Result<unknown> | Promise<Result<unknown>>,
): () => void {
  let current = storage
  for (const [method, channel] of Object.entries(channels))
    ipcMain.handle(channel, (event, ...args) => {
      const result = dispatch(
        current,
        method,
        args,
        isTrustedSender(event, window, allowedUrl),
      )
      if (
        !result.ok &&
        ['DB_CORRUPT', 'SCHEMA_TOO_NEW', 'DB_NOT_READY'].includes(
          result.error.code,
        )
      )
        current = { state: 'blocked', error: result.error }
      return afterDispatch ? afterDispatch(method, result) : result
    })
  return () => {
    for (const channel of Object.values(channels))
      ipcMain.removeHandler(channel)
  }
}
