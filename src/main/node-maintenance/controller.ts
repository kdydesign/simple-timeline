import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import type { EventEmitter } from 'node:events'
import { cleanMaintenanceEnvironment, prepareMaintenance, validateMaintenanceStateMessage, validateReadyMessage, type MaintenancePreparation } from './runtime'

export interface MaintenanceReady { ready: true; pid: number; recoveryShortcut: string }
export interface MaintenanceStatus { status: 'idle' | 'preparing' | 'ready' | 'error'; recoveryShortcut: string | null; error: string | null; busy: boolean }
export function waitForMaintenanceReady(child: EventEmitter & { pid?: number; send(message: unknown): unknown }, identity: { session: string; artifactId: string }, timeoutMs = 30_000): Promise<MaintenanceReady> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); child.off('message', message); child.off('error', failed); child.off('exit', exited) }
    const failed = (error: Error) => { cleanup(); reject(error) }
    const exited = () => failed(Error('Maintenance process exited before ready; an existing recovery window may already be open'))
    const message = (value: unknown) => {
      if (!child.pid || !validateReadyMessage(value, { ...identity, pid: child.pid })) return
      try {
        child.send({ type: 'accepted', ...identity })
        cleanup()
        resolve({ ready: true, pid: child.pid, recoveryShortcut: value.recoveryShortcut })
      } catch (error) { failed(error as Error) }
    }
    const timer = setTimeout(() => failed(Error('Maintenance window did not become ready. Removal is blocked.')), timeoutMs)
    child.on('message', message); child.once('error', failed); child.once('exit', exited)
  })
}

/** The child is detached; parent shutdown must never kill it or release its mutation lock. */
export function createNodeMaintenanceController(options: MaintenancePreparation & { changed?: (state: MaintenanceStatus) => void }) {
  let child: ChildProcess | null = null
  let pending: Promise<MaintenanceReady> | null = null
  let ready: MaintenanceReady | null = null
  let active = false
  let state: MaintenanceStatus = { status: 'idle', recoveryShortcut: null, error: null, busy: false }
  const publish = (next: MaintenanceStatus) => { state = next; options.changed?.(state) }
  return {
    isActive: () => active,
    getState: () => state,
    open(): Promise<MaintenanceReady> {
      if (pending) return pending
      if (child && active) {
        if (child.connected) child.send({ type: 'focus' }, () => {})
        return ready ? Promise.resolve(ready) : Promise.reject(Error('복구 창의 준비를 확인하지 못했습니다. 열린 복구 창을 확인해 주세요.'))
      }
      if (process.platform !== 'win32' || process.arch !== 'x64') return Promise.reject(Error('독립 Node 복구는 Windows x64에서 지원합니다.'))
      active = true
      publish({ status: 'preparing', recoveryShortcut: null, error: null, busy: state.busy })
      pending = (async () => {
        const prepared = await prepareMaintenance(options)
        const session = randomBytes(32).toString('hex')
        const launched = spawn(prepared.executable, [prepared.appDirectory, `--workrail-maintenance-session=${session}`], {
          cwd: prepared.directory, env: cleanMaintenanceEnvironment(process.env),
          detached: true, shell: false, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: false,
        })
        child = launched
        let reportedBusy = false
        launched.on('error', () => {})
        launched.on('message', value => {
          if (child === launched && launched.pid && validateMaintenanceStateMessage(value, {session, artifactId:prepared.artifactId, pid:launched.pid})) { reportedBusy=value.busy; publish({...state, busy:value.busy}) }
        })
        launched.once('disconnect', () => {
          if (child === launched) publish({...state, busy:true, error:'복구 프로세스의 연결이 끊어져 작업 종료를 확인하지 못했습니다.'})
        })
        launched.once('exit', () => {
          if (child !== launched) return
          child = null; ready = null; active = false
          publish({ status: reportedBusy ? 'error' : 'idle', recoveryShortcut: state.recoveryShortcut, error: reportedBusy ? '복구 프로세스 종료 후 Windows 작업의 수명을 확인하지 못했습니다.' : null, busy:reportedBusy })
        })
        launched.unref()
        launched.channel?.unref()
        ready = await waitForMaintenanceReady(launched, { session, artifactId: prepared.artifactId })
        if (child !== launched || launched.exitCode !== null) throw Error('복구 창이 준비 직후 종료되었습니다.')
        publish({ status: 'ready', recoveryShortcut: ready.recoveryShortcut, error: null, busy:state.busy })
        return ready
      })().catch(error => {
        if (!child) active = false
        // An unresponsive child may still be alive. Keep parent mutations blocked.
        publish({ status: 'error', recoveryShortcut: state.recoveryShortcut, error: error instanceof Error ? error.message : '복구 창을 준비하지 못했습니다.', busy:state.busy })
        throw error
      }).finally(() => { pending = null })
      return pending
    },
  }
}
