import { randomUUID } from 'node:crypto'
import { mkdir, open } from 'node:fs/promises'
import { join } from 'node:path'
import { finished } from 'node:stream/promises'
import { isNodeVersion, type NodeEnvironment, type NodeManagementError, type NodeManagementErrorCode, type NodeManagementState, type NodeOperation, type NodeRelease } from '../../shared/node-management'
import type { MutationBarrier } from '../updates/installer'
import { emptyNodeState, type EnvironmentChanged } from './environments'
import { capabilities } from './manager-support'
import { nodeManagementError } from './service'
import { missingBuildTools, type WslInspection } from './wsl-guest'
import type { createWslRunner } from './wsl-host'

const error = (code: NodeManagementErrorCode, message: string): NodeManagementError => ({ code, message })
const changedTarget = error('environment-conflict', 'WSL 기본 사용자 또는 nodenv 경로가 변경되었습니다. 새 대상의 정보를 확인해 주세요.')
const inspectionError = error('inspection-failed', 'WSL 배포판의 실행 상태와 기본 사용자의 Linux 환경을 다시 확인해 주세요.')
const uncertain = error('operation-unknown', 'WSL 작업의 종료 여부를 확인하지 못했습니다. 배포판이 종료된 뒤 다시 확인해 주세요. 종료 상태가 확인될 때까지 중복 변경과 앱 종료를 차단합니다.')

export async function openWslLog(profile: string) {
  const directory = join(profile, 'node-operation-logs')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const path = join(directory, randomUUID() + '.log')
  const file = await open(path, 'wx', 0o600)
  const stream = file.createWriteStream()
  // Attach the error handler immediately, including failures during a long build.
  const flushed = finished(stream).then(() => true, () => false)
  let bytes = 0
  const tail: string[] = []
  return {
    path,
    line(value: string) {
      const data = value.slice(-1500) + '\n'
      bytes += Buffer.byteLength(data)
      if (bytes <= 4 * 1024 * 1024) stream.write(data)
      else {
        if (tail.length === 100) tail.shift()
        tail.push(data)
      }
    },
    async close(outcome: string) {
      if (tail.length) stream.write('…\n' + tail.join(''))
      stream.end(outcome + '\n')
      if (!await flushed) throw Error('Could not save WSL operation log')
    },
  }
}

function classifyLine(line: string): NodeOperation['phase'] | undefined {
  if (/(?:^|[\s/])(?:g\+\+|clang\+\+|CXX\(target\)|CC\(target\)|make\[\d+\]|\.\/configure)(?=[\s:]|$)/.test(line)) return 'compiling'
  if (/^Downloading |^-> https?:/.test(line)) return 'downloading'
  if (/^Installing |^Extracting |^tar\s+-/.test(line)) return 'extracting'
}

function annotate(rows: NodeRelease[], info: WslInspection) {
  const available = new Set(info.definitions)
  return rows.map(row => ({
    ...row,
    installReason: info.capabilities.install.reason ?? (!available.has(row.version) ? '이 버전의 node-build 설치 정의가 없습니다.'
      : row.sourceOnly && !info.buildTools ? missingBuildTools : null),
  }))
}

const identity = (info: WslInspection) => JSON.stringify([info.user, info.root, info.manager.path, info.arch])

export function createWslService(options: {
  environment: NodeEnvironment
  runner: Pick<ReturnType<typeof createWslRunner>, 'isStopped' | 'probe' | 'change'>
  loadCatalog(arch: string): Promise<NodeRelease[]>
  changed: EnvironmentChanged
  openLog?(): ReturnType<typeof openWslLog>
  barrier?: MutationBarrier
}) {
  const env = options.environment
  let state = emptyNodeState('win32', true)
  let current: WslInspection | undefined
  let knownIdentity: string | undefined
  let releases: NodeRelease[] | undefined
  let generation = 0
  let readInspection: Promise<WslInspection | undefined> | undefined
  let catalogRequest: Promise<void> | undefined
  let catalogGeneration = 0
  let releaseUnknown: (() => void) | undefined

  function invalidateCatalog() {
    catalogGeneration++
    catalogRequest = undefined
  }
  let controller: AbortController | undefined
  let pending: Promise<NodeManagementState> | undefined

  function publish(patch: Partial<NodeManagementState>) {
    state = { ...state, ...patch, revision: state.revision + 1 }
    options.changed(state, current?.user ?? null)
    return state
  }
  function progress(phase: NodeOperation['phase'], cancellable: boolean) {
    if (state.busy) publish({ busy: { ...state.busy, phase, cancellable } })
  }

  async function inspect(token: number) {
    try {
      const info = await options.runner.probe(env)
      if (token !== generation) return
      const nextIdentity = identity(info)
      const changed = knownIdentity !== undefined && knownIdentity !== nextIdentity
      current = info
      knownIdentity = nextIdentity
      if (changed) { invalidateCatalog(); releases = undefined }
      publish({
        manager: info.manager, installedVersions: info.installedVersions, activeVersion: info.activeVersion,
        activeSource: info.activeVersion ? 'nodenv' : null, capabilities: info.capabilities, conflicts: info.conflicts,
        checkedAt: new Date().toISOString(),
        ...(changed ? { error: changedTarget, catalog: emptyNodeState('win32', true).catalog, operationLog: [], operationLogPath: undefined }
          : { error: state.error?.code === 'inspection-failed' ? null : state.error,
              ...(releases ? { catalog: { ...state.catalog, releases: annotate(releases, info) } } : {}) }),
      })
      return info
    } catch {
      if (token !== generation) return
      invalidateCatalog()
      current = undefined
      releases = undefined
      publish({ manager: { kind: 'nodenv', status: 'error', version: null }, checkedAt: null, installedVersions: [],
        capabilities: capabilities(inspectionError.message), activeVersion: null, activeSource: null, conflicts: [],
        error: inspectionError, catalog: emptyNodeState('win32', true).catalog })
    }
  }

  function catalog(info: WslInspection, token: number) {
    if (catalogRequest) return catalogRequest
    const requestId = ++catalogGeneration
    const valid = () => requestId === catalogGeneration && token === generation
    publish({ catalog: { ...state.catalog, status: 'loading', error: null } })
    const request = (async () => {
      try {
        const rows = await options.loadCatalog(info.arch)
        if (!valid() || !current) return
        releases = rows
        publish({ catalog: { releases: annotate(rows, current), checkedAt: new Date().toISOString(), status: 'ready', error: null } })
      } catch {
        if (valid()) publish({ catalog: { ...state.catalog, status: 'error', error: nodeManagementError('catalog-unavailable') } })
      }
    })()
    catalogRequest = request
    return request.finally(() => { if (catalogRequest === request) catalogRequest = undefined })
  }

  async function read(refresh: boolean) {
    if (state.busy) {
      const release = releaseUnknown
      if (release && await options.runner.isStopped(env).catch(() => false) && release === releaseUnknown) {
        releaseUnknown = undefined
        release()
        current = undefined
        releases = undefined
        publish({ ...emptyNodeState('win32', true), operationLog: state.operationLog, operationLogPath: state.operationLogPath,
          error: error('verification-failed', 'WSL 배포판 종료를 확인했습니다. 다음 환경 시작 후 작업 결과를 다시 확인해 주세요.') })
      }
      return state
    }
    const token = generation
    const request = readInspection ??= inspect(token)
    const info = await request
    if (request === readInspection) readInspection = undefined
    if (refresh && info && token === generation && current && identity(info) === identity(current)) await catalog(info, token)
    return state
  }

  async function perform(kind: 'install' | 'use', version: string, token: number, signal: AbortSignal) {
    const expected = knownIdentity
    let info = await inspect(token)
    if (!info) return inspectionError
    if (expected && identity(info) !== expected) return changedTarget
    if (kind === 'install' && !info.installedVersions.includes(version) && state.catalog.status !== 'ready' && info.capabilities.install.available) {
      const before = identity(info)
      await catalog(info, token)
      info = await inspect(token)
      if (!info) return inspectionError
      if (before !== identity(info)) return changedTarget
    }
    const reason = info.capabilities[kind].reason
    if (reason || !info.capabilities[kind].available) return error('environment-conflict', reason ?? 'WSL 도구의 기능을 확인해 주세요.')
    if (kind === 'install') {
      if (info.installedVersions.includes(version)) return null
      if (state.catalog.status !== 'ready') return nodeManagementError('catalog-unavailable')
      const row = state.catalog.releases.find(v => v.version === version)
      if (!row || row.installReason) return error('version-unavailable', row?.installReason ?? '선택한 WSL 환경의 공식 목록에서 이 버전을 확인하지 못했습니다.')
    } else {
      if (!info.installedVersions.includes(version)) return error('version-not-installed', '선택 사용자의 nodenv에 설치된 버전을 선택해 주세요.')
      if (info.global === version) return null
    }
    const lines: string[] = []
    const log = await options.openLog?.().catch(() => undefined)
    if (options.openLog && !log) lines.push('작업 로그 파일을 열지 못했습니다.')
    if (log) publish({ operationLogPath: log.path })
    progress('waiting', true)
    let timer: ReturnType<typeof setTimeout> | undefined
    function flush() {
      if (timer) clearTimeout(timer)
      timer = undefined
      publish({ operationLog: [...lines] })
    }
    let outcome
    try {
      outcome = await options.runner.change(env, info, kind, version, signal, raw => {
        const line = raw.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '').trim().slice(-1500)
        if (!line || !state.busy) return
        log?.line(line)
        if (lines.length === 100) lines.shift()
        lines.push(line)
        const phase = classifyLine(line)
        if (phase && phase !== state.busy.phase) {
          flush()
          progress(phase, true)
        } else if (!timer) {
          timer = setTimeout(flush, 200)
          timer.unref()
        }
      })
    } catch {
      // The host runner throws only before creating the job. Unconfirmed child
      // exits are returned explicitly as 'unknown'.
      outcome = 'failed' as const
    }
    if (log) {
      try { await log.close(outcome) } catch { lines.push('작업 로그 파일을 끝까지 저장하지 못했습니다.') }
    }
    flush()
    progress('verifying', false)
    const after = await inspect(token)
    if (outcome === 'unknown') return uncertain
    if (outcome === 'cancelled') return error('cancelled', after ? 'WSL 작업을 취소하고 현재 설치 목록과 기본 버전을 다시 확인했습니다.' : 'WSL 작업이 취소되었습니다. 현재 설치 상태를 다시 확인해 주세요.')
    if (outcome === 'failed') return error('operation-failed', 'WSL Node 작업에 실패했습니다. 진행 로그와 기본 사용자, 빌드 도구 및 파일 권한을 확인해 주세요.')
    if (!after || identity(info) !== identity(after) || !after.capabilities.list.available || !after.installedVersions.includes(version)
      || (kind === 'install' ? after.global !== info.global : after.global !== version)) return nodeManagementError('verification-failed')
    return null
  }

  function operate(kind: 'install' | 'use', version: string): Promise<NodeManagementState> {
    if (!isNodeVersion(version)) return Promise.resolve({ ...state, error: nodeManagementError('invalid-request') })
    if (state.busy) return Promise.resolve({ ...state, error: state.error ?? nodeManagementError('busy') })
    if (options.barrier?.blocked()) return Promise.resolve({ ...state, error: nodeManagementError('shutdown') })
    const token = ++generation, abort = new AbortController()
    readInspection = undefined
    invalidateCatalog()
    const wasLoading = state.catalog.status === 'loading'
    controller = abort
    let finish!: (state: NodeManagementState) => void
    const result = new Promise<NodeManagementState>(resolve => { finish = resolve })
    pending = result
    publish({ busy: { kind, version, phase: 'checking', cancellable: false }, operationLog: [], operationLogPath: undefined, error: null,
      ...(wasLoading ? { catalog: { ...state.catalog, status: releases ? 'ready' : 'idle' } } : {}) })
    const run = async () => {
      const failure = await perform(kind, version, token, abort.signal)
      controller = undefined
      pending = undefined
      const unknown = failure?.code === 'operation-unknown'
      const termination = unknown ? new Promise<void>(resolve => { releaseUnknown = resolve }) : undefined
      finish(publish({ busy: unknown ? { kind, version, phase: 'waiting', cancellable: false } : null, error: failure }))
      if (termination) await termination
    }
    void (options.barrier ? options.barrier.run(run) : run()).catch(() => {
      controller = undefined
      pending = undefined
      finish(publish({ busy: null, error: inspectionError }))
    })
    return result
  }

  const unsupported = async () => ({ ...state, error: nodeManagementError('invalid-request') })
  return {
    getState: () => read(false), refreshCatalog: () => read(true),
    install: (version: string) => operate('install', version), use: (version: string) => operate('use', version),
    installManager: unsupported, removeStandalone: unsupported, isBusy: () => state.busy !== null,
    async cancelOperation() {
      if (!state.busy?.cancellable || !controller || !pending) return unsupported()
      controller.abort()
      return pending
    },
  }
}
