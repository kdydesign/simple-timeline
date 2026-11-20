import {draftProblems, type PrDraftProblem} from '../../shared/postrail-console'
import {dialog, ipcMain, safeStorage, session, type BrowserWindow, type IpcMainInvokeEvent} from 'electron'
import type {PrEnv, PrMethod, PrMutation} from '../../shared/postrail'
import {postRailChannel, postRailChanged, type PostRailChange} from '../../shared/postrail-api'
import {postRailBusy, type PrStart} from '../../shared/postrail-run'
import {isTrustedSender} from '../ipc-core'
import {PostRailRunner, PostRailRunError} from './runner'
import {canProtectPostRailPassword, PostRailStore, PostRailStoreError} from './store'

class CommandError extends Error {}

function validAttemptId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
}

function authSettings(env: PrEnv) {
  // A rename or a change to a variable used exclusively by the main request can keep the token.
  let body = env.loginBody
  try { body = JSON.stringify(JSON.parse(body)) } catch { /* Draft login JSON may be incomplete. */ }
  const templates = [env.apiOrigin, env.loginUrl, body, ...Object.values(env.loginHeaders)]
  const names = new Set(templates.flatMap(template => Array.from(template.matchAll(/\$\{([^{}]+)\}/g), match => match[1])))
  const values = [...names].sort().map(name => [name, Object.hasOwn(env.variables,name) ? env.variables[name] : null])
  return JSON.stringify([
    env.apiOrigin, env.loginUrl, Object.entries(env.loginHeaders).sort(), env.loginBody,
    env.tokenHeader, env.tokenPath, env.tokenPrefix, env.hasPassword, values,
  ])
}

export function registerPostRailIpc(window: BrowserWindow, rendererUrl: string, profile: string, blocked: () => boolean) {
  let store: PostRailStore | undefined
  let runner: PostRailRunner | undefined
  let transport: Electron.Session | undefined
  let runTimer: ReturnType<typeof setTimeout> | undefined
  let approval: AbortController | undefined
  let closing = false
  let shutdownWork: Promise<void> | undefined

  const getStore = () => store ??= new PostRailStore(profile, safeStorage)

  function notify(change: PostRailChange) {
    if (closing || window.isDestroyed() || window.webContents.isDestroyed()) return
    const sender = window.webContents
    if (!isTrustedSender({sender, senderFrame:sender.mainFrame}, window, rendererUrl)) return
    try { sender.send(postRailChanged, change) } catch { /* A navigation may remove the frame during delivery. */ }
  }

  function changed() {
    if (closing || runTimer) return
    runTimer = setTimeout(() => {
      runTimer = undefined
      notify('run')
    }, 100)
  }

  function getRunner() {
    return runner ??= new PostRailRunner({
      read: () => getStore().read(),
      password: id => getStore().password(id),
      reserveIndex: id => getStore().reserveIndex(id),
      openFile: (id,file) => getStore().openFile(id,file),
    }, (url, init) => {
      transport ??= session.fromPartition('postrail', {cache:false})
      return transport.fetch(url, {...init, redirect:'manual', credentials:'omit', cache:'no-store', bypassCustomProtocolHandlers:true})
    }, 30_000, changed)
  }

  function checkOpen(event: IpcMainInvokeEvent, writing: boolean) {
    if (closing || !isTrustedSender(event, window, rendererUrl)) throw new CommandError('PostRail 접근이 허용되지 않았습니다.')
    if (writing && blocked()) throw new CommandError('앱 종료 또는 업데이트가 진행 중입니다.')
  }

  async function start(event: IpcMainInvokeEvent, input: PrStart) {
    // The renderer can only supply request data. Native confirmation binds consent to the exact destinations.
    const attemptId = validAttemptId(input.attemptId) ? input.attemptId : undefined
    const draft = {attemptId, request:input.request, environmentId:input.environmentId, count:input.count}
    const active = getRunner()
    if (blocked()) active.rejectStart(draft, '앱 종료 또는 업데이트가 진행 중입니다.')
    if (approval) active.rejectStart(draft, '현재 전송 확인을 마친 뒤 다시 보내세요.')
    const addresses = active.preview(draft)
    if (!addresses.length) return active.start({...draft, approvedHttpUrls:[]})
    const prompt = new AbortController()
    approval = prompt
    try {
      const choice = await dialog.showMessageBox(window, {
        type:'warning', title:'PostRail 평문 연결', message:'다음 HTTP 주소로 평문 전송하시겠습니까?',
        detail:addresses.join('\n'), buttons:['취소','보내기'], cancelId:0, defaultId:0,
        noLink:true, signal:prompt.signal,
      }).catch(() => {
        if (prompt.signal.aborted) return {response:0}
        return active.rejectStart(draft, '평문 전송 확인 창을 열 수 없습니다.')
      })
      checkOpen(event, false)
      if (prompt.signal.aborted || choice.response !== 1) return null
      if (blocked()) active.rejectStart(draft, '앱 종료 또는 업데이트가 진행 중입니다.')
      return active.start({...draft, approvedHttpUrls:addresses, allowPlaintext:true})
    } finally {
      if (approval === prompt) approval = undefined
    }
  }

  function mutate(cmd: PrMutation) {
    const db = getStore()
    const state = runner?.state()
    if (state && postRailBusy(state.phase) && cmd.type === 'request.delete' && cmd.id === state.requestId) {
      throw new CommandError('전송 중인 요청은 실행이 끝난 뒤 삭제하세요.')
    }
    const environmentEdit = cmd.type === 'env.save' || cmd.type === 'env.delete' || cmd.type === 'env.batch'
    const before = runner && environmentEdit ? db.read().environments : []
    const library = db.mutate(cmd)
    // An open confirmation applies to the definition and credentials shown at preview time.
    approval?.abort()
    if (runner && before.length) {
      const saves = cmd.type === 'env.save' ? [cmd] : cmd.type === 'env.batch' ? cmd.saves : []
      const passwords = new Set(saves.filter(item => item.password !== undefined).map(item => item.environment.id))
      const byId = new Map(library.environments.map(env => [env.id, env]))
      for (const previous of before) {
        const next = byId.get(previous.id)
        if (!next || passwords.has(previous.id) || authSettings(previous) !== authSettings(next)) {
          runner.invalidateEnvironment(previous.id)
        }
      }
    }
    notify('library')
    return library
  }

  ipcMain.handle(postRailChannel, async (event, method: unknown, ...args: unknown[]) => {
    try {
      checkOpen(event, method === 'mutate' || method === 'logout' || method === 'chooseFile')
      switch (method) {
        case 'read': if (!args.length) return getStore().read(); break
        case 'chooseFile': {
          const [id,retainedIds=[]] = args
          if (args.length <= 2 && typeof id === 'string' && Array.isArray(retainedIds) && retainedIds.every(ref=>typeof ref==='string')) {
            const choice=await dialog.showOpenDialog(window,{title:'PostRail 첨부 파일 선택',properties:['openFile']})
            checkOpen(event,true)
            if (choice.canceled || !choice.filePaths.length) return null
            return getStore().selectFile(id,choice.filePaths[0],retainedIds)
          }
          break
        }
        case 'capability': if (!args.length) return canProtectPostRailPassword(safeStorage); break
        case 'console':
          if (args.length === 1 && typeof args[0] === 'number' && Number.isSafeInteger(args[0]) && args[0] >= 0) return getRunner().consoleSince(args[0])
          break
        case 'invalidDraft':
          if ((args.length === 5 || (args.length === 6 && (args[5] === undefined || validAttemptId(args[5])))) && typeof args[4] === 'string' && typeof args[0] === 'string' && typeof args[1] === 'string' &&
              typeof args[2] === 'string' && Object.hasOwn(draftProblems, args[2]) &&
              typeof args[3] === 'string' && ['GET','POST','DELETE'].includes(args[3])) {
            return getRunner().invalidDraft(args[0], args[1], args[2] as PrDraftProblem, args[3] as PrMethod, args[4], args[5] as string|undefined)
          }
          break
        case 'state': if (!args.length) return getRunner().state(); break
        case 'mutate': if (args.length === 1 && args[0] && typeof args[0] === 'object') return mutate(args[0] as PrMutation); break
        case 'start': if (args.length === 1 && args[0] && typeof args[0] === 'object') return await start(event, args[0] as PrStart); break
        case 'stop':
          if (!args.length) {
            approval?.abort()
            return getRunner().stop()
          }
          break
        case 'logout':
          if (args.length === 1 && typeof args[0] === 'string') {
            approval?.abort()
            runner?.invalidateEnvironment(args[0])
            return
          }
          break
        case 'page':
        case 'detail':
          if (args.length === 2 && typeof args[0] === 'string' && typeof args[1] === 'string') {
            if (runner?.state().runId !== args[1]) return method === 'page' ? [] : null
            return method === 'page' ? runner.page(args[0]) : runner.detail(args[0])
          }
          break
      }
      throw new CommandError('잘못된 PostRail 명령입니다.')
    } catch (error) {
      if (error instanceof CommandError || error instanceof PostRailRunError || error instanceof PostRailStoreError) {
        throw Error(error.message)
      }
      throw Error('PostRail 작업을 완료할 수 없습니다.')
    }
  })

  function shutdown(): Promise<void> {
    if (shutdownWork) return shutdownWork
    closing = true
    approval?.abort()
    clearTimeout(runTimer)
    shutdownWork = Promise.resolve(runner?.shutdown()).finally(() => store?.close())
    return shutdownWork
  }

  function stopDispatch() {
    approval?.abort()
    runner?.stop()
  }

  return {shutdown, stopDispatch, dispose() {
    ipcMain.removeHandler(postRailChannel)
    void shutdown().catch(() => { /* The shutdown caller receives the same failure. */ })
  }}
}
