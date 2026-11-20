import {ipcMain, type IpcMainInvokeEvent} from 'electron'
import {isTermRailEndpoint, termRailSessionLimit, termRailSshChannel} from '../../shared/termrail-ssh'
import {isSshSessionId, type TermRailSshService} from './ssh-service'
import type {StagedStartupFile, TermRailStartupFiles} from './startup-files'

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
  const drafts = new Map<string, {file?: StagedStartupFile; busy: boolean; boundId?: string}>()
  const interrupted = new Set<string>()
  function cancelDraft(id: string) {
    drafts.get(id)?.file?.encrypted.fill(0)
    drafts.delete(id)
  }
  function disposeSessions() {
    documentVersion++
    pending.clear()
    for (const [id, draft] of drafts) {
      // The previous renderer may have committed localStorage before its acknowledgement arrived.
      if (draft.boundId) interrupted.add(draft.boundId)
      cancelDraft(id)
    }
    service.dispose()
  }
  ipcMain.handle(termRailSshChannel, async (event, method, id, ...args) => {
    const version = documentVersion
    const current = () => version === documentVersion && allows(event, method)
    if (!current()) throw forbidden()
    if (method === 'recoverStartup') {
      if (args.length || !Array.isArray(id) || !id.every(ref => typeof ref === 'string')) throw invalid()
      const retained = new Set(id)
      for (const ref of interrupted) {
        if (!retained.has(ref)) files.discard(ref)
        interrupted.delete(ref)
      }
      return
    }
    if (!isSshSessionId(id)) throw invalid()
    if (method === 'finishStartup') {
      const savedId = args[0]
      const draft = drafts.get(id)
      if (args.length > 1 || (savedId !== undefined && (!isSshSessionId(savedId) || savedId !== draft?.boundId))) throw invalid()
      if (draft?.boundId && !savedId) files.discard(draft.boundId)
      return cancelDraft(id)
    }
    if (method === 'pickStartup') {
      if (args.length) throw invalid()
      const draft = drafts.get(id) ?? {busy: false}
      if (draft.busy) throw invalid()
      draft.busy = true
      drafts.set(id, draft)
      const active = () => drafts.get(id) === draft && current()
      try {
        const path = await choose().catch(() => {throw Error('시작 파일 선택 창을 열 수 없습니다.')})
        if (!active()) throw forbidden()
        if (!path) return null
        const file = await files.stage(path)
        if (!active()) {file.encrypted.fill(0); throw forbidden()}
        draft.file?.encrypted.fill(0)
        draft.file = file
        return file.name
      } finally {
        draft.busy = false
        if (!draft.file && drafts.get(id) === draft) drafts.delete(id)
      }
    }
    if (method === 'bindStartup') {
      const [endpoint] = args
      const draft = drafts.get(id)
      if (args.length !== 1 || !isTermRailEndpoint(endpoint) || !draft?.file || draft.busy) throw invalid()
      draft.busy = true
      try {
        if (draft.boundId) files.discard(draft.boundId)
        draft.boundId = undefined
        const active = () => drafts.get(id) === draft && current()
        const bound = await files.bind(draft.file, {host:endpoint.host, port:endpoint.port}, active)
        if (!active()) {files.discard(bound.id); throw forbidden()}
        draft.boundId = bound.id
        return bound
      } finally {
        draft.busy = false
      }
    }
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
