import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import type { EventEmitter } from 'node:events'
import { cleanMaintenanceEnvironment, prepareMaintenance, validateMaintenanceStateMessage, validateReadyMessage, type MaintenancePreparation } from './runtime'

const failureMessages = {
  unsupported: '독립 Node 복구는 Windows x64에서 지원합니다.',
  missing: '복구 창에 필요한 Electron 또는 개발 빌드 파일이 없습니다. 개발 앱을 다시 빌드하고 실행해 주세요.',
  permissions: '복구 파일을 읽거나 저장할 수 없습니다. 개발 폴더와 사용자 AppData 폴더의 접근 권한을 확인해 주세요.',
  space: '복구 파일을 저장할 디스크 공간이 부족합니다. 공간을 확보한 뒤 다시 시도해 주세요.',
  prepare: '독립 관리 창의 파일을 준비하거나 검증하지 못했습니다. 개발 앱을 다시 빌드한 뒤 시도해 주세요.',
  launch: '복구 파일을 준비했지만 Electron 프로세스를 시작하지 못했습니다. Windows의 앱 실행 권한을 확인해 주세요.',
  exited: '관리 창이 준비 전에 종료되었습니다. 이미 열린 복구 창이나 별도로 표시된 시작 오류를 확인해 주세요.',
  timeout: '관리 창의 준비 응답을 받지 못했습니다. 열린 복구 창을 확인하고, 응답이 없으면 창을 닫은 뒤 다시 시도해 주세요.',
  connection: '복구 창과 통신할 수 없습니다. 열린 창을 확인하거나 시작 메뉴에서 WorkRail Node 환경 복구를 열어 주세요.',
} as const

export class MaintenanceOpenError extends Error {
  constructor(reason: keyof typeof failureMessages) { super(failureMessages[reason]) }
}

function preparationFailure(error: unknown) {
  const code = (error as NodeJS.ErrnoException | null)?.code
  if (code === 'ENOENT') return new MaintenanceOpenError('missing')
  if (code === 'EACCES' || code === 'EPERM') return new MaintenanceOpenError('permissions')
  if (code === 'ENOSPC') return new MaintenanceOpenError('space')
  return new MaintenanceOpenError('prepare')
}

export interface MaintenanceReady { ready: true; pid: number; recoveryShortcut: string }
export interface MaintenanceStatus { status: 'idle' | 'preparing' | 'ready' | 'error'; recoveryShortcut: string | null; error: string | null; busy: boolean }
export function waitForMaintenanceReady(child: EventEmitter & { pid?: number; send(message: unknown, callback: (error: Error | null) => void): unknown }, identity: { session: string; artifactId: string }, options: { timeoutMs?: number; refocus?: boolean } = {}): Promise<MaintenanceReady> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); child.off('message', message); child.off('error', launchFailed); child.off('exit', exited); child.off('disconnect', disconnected) }
    const failed = (error: Error) => { cleanup(); reject(error) }
    const disconnected = () => failed(new MaintenanceOpenError('connection'))
    const launchFailed = () => failed(new MaintenanceOpenError('launch'))
    const exited = () => failed(new MaintenanceOpenError('exited'))
    const message = (value: unknown) => {
      const pid = child.pid
      if (!pid || !validateReadyMessage(value, { ...identity, pid })) return
      child.off('message', message)
      try {
        child.send({ type: 'accepted', ...identity }, error => {
          if (error) return failed(new MaintenanceOpenError('connection'))
          cleanup()
          resolve({ ready: true, pid, recoveryShortcut: value.recoveryShortcut })
        })
      } catch { failed(new MaintenanceOpenError('connection')) }
    }
    const timer = setTimeout(() => failed(new MaintenanceOpenError('timeout')), options.timeoutMs ?? 30_000)
    child.on('message', message); child.once('error', launchFailed); child.once('exit', exited); child.once('disconnect', disconnected)
    if (options.refocus) {
      try { child.send({ type: 'focus' }, error => { if (error) disconnected() }) }
      catch { disconnected() }
    }
  })
}

/** The child is detached; parent shutdown must never kill it or release its mutation lock. */
export function createNodeMaintenanceController(options: MaintenancePreparation & { changed?: (state: MaintenanceStatus) => void }) {
  type Running = { child: ChildProcess; session: string; artifactId: string }
  let running: Running | null = null
  let pending: Promise<MaintenanceReady> | null = null
  let ready: MaintenanceReady | null = null
  let active = false
  let state: MaintenanceStatus = { status: 'idle', recoveryShortcut: null, error: null, busy: false }
  const publish = (next: MaintenanceStatus) => { state = next; options.changed?.(state) }

  async function confirmReady(instance: Running, refocus = false) {
    const { child, session, artifactId } = instance
    const evidence = await waitForMaintenanceReady(child, { session, artifactId }, { refocus })
    if (running !== instance || child.exitCode !== null) throw new MaintenanceOpenError('exited')
    ready = evidence
    publish({ status: 'ready', recoveryShortcut: evidence.recoveryShortcut, error: null, busy: state.busy })
    return evidence
  }

  async function launch() {
    const prepared = await prepareMaintenance(options).catch(error => { throw preparationFailure(error) })
    const session = randomBytes(32).toString('hex')
    const child = spawn(prepared.executable, [prepared.appDirectory, `--workrail-maintenance-session=${session}`], {
      cwd: prepared.directory, env: cleanMaintenanceEnvironment(process.env),
      detached: true, shell: false, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: false,
    })
    const instance = { child, session, artifactId: prepared.artifactId }
    running = instance
    let reportedBusy = false
    child.on('error', () => {
      // A failed spawn emits error and close, but may never emit exit.
      if (running === instance && !child.pid) { running = null; active = false }
    })
    child.on('message', value => {
      if (running === instance && child.pid && validateMaintenanceStateMessage(value, { session, artifactId: prepared.artifactId, pid: child.pid })) {
        reportedBusy = value.busy
        publish({ ...state, busy: value.busy })
      }
    })
    child.once('disconnect', () => {
      if (running === instance) publish({...state, status: 'error', busy:true, error:'복구 프로세스의 연결이 끊어져 작업 종료를 확인하지 못했습니다.'})
    })
    child.once('exit', () => {
      if (running !== instance) return
      running = null; ready = null; active = false
      publish({ status: reportedBusy ? 'error' : 'idle', recoveryShortcut: state.recoveryShortcut, error: reportedBusy ? '복구 프로세스 종료 후 Windows 작업의 수명을 확인하지 못했습니다.' : null, busy:reportedBusy })
    })
    child.unref()
    child.channel?.unref()
    return confirmReady(instance)
  }

  return {
    isActive: () => active,
    getState: () => state,
    open(): Promise<MaintenanceReady> {
      if (pending) return pending
      if (running && !running.child.connected) return Promise.reject(new MaintenanceOpenError('connection'))
      if (running && ready) {
        const existing = ready
        const child = running.child
        return new Promise((resolve, reject) => {
          child.send({ type: 'focus' }, error => {
            if (error) reject(new MaintenanceOpenError('connection'))
            else resolve(existing)
          })
        })
      }
      if (process.platform !== 'win32' || process.arch !== 'x64') return Promise.reject(new MaintenanceOpenError('unsupported'))
      active = true
      publish({ status: 'preparing', recoveryShortcut: state.recoveryShortcut, error: null, busy: state.busy })
      pending = (running ? confirmReady(running, true) : launch()).catch(error => {
        // An unresponsive child may still be alive. Keep parent mutations blocked.
        if (!running) active = false
        const failure = error instanceof MaintenanceOpenError ? error : new MaintenanceOpenError('launch')
        publish({ status: 'error', recoveryShortcut: state.recoveryShortcut, error: failure.message, busy:state.busy })
        throw failure
      }).finally(() => { pending = null })
      return pending
    },
  }
}
