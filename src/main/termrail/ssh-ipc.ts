import {ipcMain, type IpcMainInvokeEvent} from 'electron'
import {isTermRailEndpoint, termRailSessionLimit, termRailSshChannel} from '../../shared/termrail-ssh'
import {isSshSessionId, type TermRailSshService} from './ssh-service'
import type {TermRailStartupFiles} from './startup-files'

const invalid = () => Error('잘못된 터미널 요청입니다.')
const forbidden = () => Error('터미널 접근이 허용되지 않았습니다.')

export function registerTermRailSshIpc(
  service: TermRailSshService,
  allows: (event: IpcMainInvokeEvent, method: unknown) => boolean,
  files: TermRailStartupFiles,
  choose: () => Promise<string | undefined>,
) {
  let documentVersion = 0
  const pending = new Map<string, Promise<void>>()
  function disposeSessions() {
    documentVersion++
    pending.clear()
    service.dispose()
  }
  ipcMain.handle(termRailSshChannel, async (event, method, id, ...args) => {
    const version = documentVersion
    const current = () => version === documentVersion && allows(event, method)
    if (!current()) throw forbidden()
    if (method === 'pickStartup') {
      if (args.length || !isTermRailEndpoint(id)) throw invalid()
      const path = await choose().catch(() => {throw Error('시작 파일 선택 창을 열 수 없습니다.')})
      if (!current()) throw forbidden()
      if (!path) return null
      return files.importFile(path, {host: id.host, port: id.port}, current)
    }
    if (!isSshSessionId(id)) throw invalid()
    if (method === 'discardStartup' && !args.length) return files.discard(id)
    if (method === 'open') {
      const input = args[0]
      if (args.length !== 1 || !isTermRailEndpoint(input) || pending.has(id)) throw invalid()
      const {host, port} = input
      const startupId = 'startupId' in input ? input.startupId : undefined
      if (startupId === undefined) return service.open(id, {host, port})
      if (!isSshSessionId(startupId) || pending.size >= termRailSessionLimit) throw invalid()
      const opening: Promise<void> = files.resolve(startupId, {host, port}).then(startup => {
        if (pending.get(id) !== opening || !current()) throw forbidden()
        service.open(id, {host, port}, startup)
      }).finally(() => {
        if (pending.get(id) === opening) pending.delete(id)
      })
      pending.set(id, opening)
      return opening
    }
    if (method === 'startProfile') {
      const [startupId] = args
      if (args.length !== 1 || !isSshSessionId(startupId)) throw invalid()
      const session = service.prepareProfileStart(id)
      const startup = await files.resolve(startupId, session.endpoint)
      if (!current()) throw forbidden()
      return session.start(startup)
    }
    if (method === 'close' && !args.length) {
      pending.delete(id)
      return service.close(id)
    }
    // The pane may start polling and fitting while the OS is still unlocking the file.
    const opening = pending.get(id)
    if (opening) {
      await opening
      if (!current()) throw forbidden()
    }
    switch (method) {
      case 'read': if (args.length === 1) return service.read(id, args[0]); break
      case 'trust': if (args.length === 1) return service.trust(id, args[0]); break
      case 'login': if (args.length === 2) return service.login(id, args[0], args[1]); break
      case 'write': if (args.length === 1) return service.write(id, args[0]); break
      case 'resize': if (args.length === 2) return service.resize(id, args[0], args[1]); break
    }
    throw invalid()
  })
  return {disposeSessions, unregister() {
    ipcMain.removeHandler(termRailSshChannel)
    disposeSessions()
  }}
}
