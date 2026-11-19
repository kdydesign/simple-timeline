import { randomUUID } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isEnvironmentId, type NodeEnvironment, type NodeManagementError, type NodeManagementState, type StandaloneRemovalConfirmation } from '../../shared/node-management'
import type { MutationBarrier } from '../updates/installer'
import { nodeManagementError, type NodeManagementService } from './service'

export function environmentSelectionStore(profile: string) {
  const path = join(profile, 'node-environment.json')
  return {
    async read(): Promise<string | null> {
      let content: string
      try { content = await readFile(path, 'utf8') } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
      }
      const { selectedId } = JSON.parse(content)
      if (!isEnvironmentId(selectedId)) throw Error('Invalid saved environment')
      return selectedId
    },
    async write(selectedId: string) {
      if (!isEnvironmentId(selectedId)) throw Error('Invalid environment')
      const temp = path + '.' + randomUUID() + '.tmp'
      try {
        await writeFile(temp, JSON.stringify({ selectedId }), { flag: 'wx', mode: 0o600, flush: true })
        await rename(temp, path)
      } finally { await rm(temp, { force: true }) }
    },
  }
}

export function emptyNodeState(platform: string, supported: boolean): NodeManagementState {
  return {
    revision: 0, platform, supported, manager: { status: supported ? 'checking' : 'missing', version: null },
    activeVersion: null, activeSource: null, installedVersions: [],
    catalog: { status: 'idle', releases: [], checkedAt: null, error: null },
    busy: null, error: null, conflicts: [], checkedAt: null,
  }
}

export type EnvironmentChanged = (state: NodeManagementState, user?: string | null) => void
type Backend = NodeManagementService & { cancelOperation?(): Promise<NodeManagementState> }

// A command-local error stays on its reply and never becomes a published state.
const rejectedCommand = Symbol('rejected environment command')
export function environmentCommandError(reply: NodeManagementState) {
  return rejectedCommand in reply ? reply.error : null
}

export function createEnvironmentCoordinator(options: {
  platform: string
  arch: string
  discover(): Promise<NodeEnvironment[]>
  store: ReturnType<typeof environmentSelectionStore>
  start(environment: NodeEnvironment): Promise<void>
  createWindows(changed: EnvironmentChanged): Backend
  createWsl(environment: NodeEnvironment, changed: EnvironmentChanged): Backend
  changed: EnvironmentChanged
  opener?: { openPath(path: string): Promise<string>; openExternal(url: string): Promise<void> }
  barrier?: MutationBarrier
}) {
  const supported = options.platform === 'win32' && options.arch === 'x64'
  const empty = () => emptyNodeState(options.platform, supported)
  let environments: NonNullable<NodeManagementState['environments']> = { status: 'loading', selectedId: null, items: [], error: null }
  let state: NodeManagementState = { ...empty(), environments }
  let active: NodeEnvironment | undefined, backend: Backend | undefined
  let saved: string | null | undefined
  let epoch = 0, scan = 0, commandGeneration = 0, writing = false, mutating = false
  let discovery: Promise<void> | null = null
  const inspections = new Set<Promise<NodeManagementState>>()
  const invalid = (message: string): NodeManagementError => ({ code: 'environment-conflict', message })
  const publish = (snapshot: NodeManagementState) => {
    state = { ...snapshot, environments, revision: state.revision + 1 }
    options.changed(state)
  }
  const denied = (error: NodeManagementError) => ({ ...state, error, [rejectedCommand]: true })
  const targetSelected = () => !!active && environments.status === 'ready' && environments.selectedId === active.id
  const busy = () => mutating || writing || !!backend?.isBusy()

  function activate(next: NodeEnvironment | undefined) {
    // Keep the Windows service that observed the machine reservation available for recovery.
    if (active?.kind === 'windows' && backend?.isBusy() && next?.id !== active.id) {
      publish(state)
      return
    }
    if (active?.id === next?.id && active?.running === next?.running && active?.distro === next?.distro) {
      if (next && active?.user) environments = { ...environments, items: environments.items.map(e => e.id === next.id ? { ...e, user: active!.user } : e) }
      publish(state)
      return
    }
    const generation = ++epoch
    active = next
    backend = undefined
    publish(empty())
    if (!next?.running) return
    const changed: EnvironmentChanged = (snapshot, user) => {
      if (generation !== epoch) return
      if (user !== undefined && active && user !== active.user) {
        active = { ...active, user: user ?? undefined }
        environments = { ...environments, items: environments.items.map(e => e.id === active!.id ? active! : e) }
      }
      publish(snapshot)
    }
    backend = next.kind === 'windows' ? options.createWindows(changed) : options.createWsl(next, changed)
  }

  function detect() {
    if (discovery) return discovery
    const generation = ++scan
    const request = (async () => {
      try {
        const [items, previous] = await Promise.all([
          supported ? options.discover() : Promise.resolve([]),
          saved === undefined && supported ? options.store.read() : saved,
        ])
        if (generation !== scan) return
        saved = previous ?? null
        const selected = saved ? items.find(e => e.id === saved) : items.length === 1 ? items[0] : undefined
        if (!saved && selected) {
          await options.store.write(selected.id)
          if (generation !== scan) return
          saved = selected.id
        }
        environments = { status: 'ready', items, selectedId: selected?.id ?? null, error: saved && !selected ? invalid('이전 환경을 찾지 못했습니다. 관리할 환경을 다시 선택해 주세요.') : null }
        activate(selected)
      } catch {
        if (generation !== scan) return
        environments = { ...environments, status: 'error', selectedId: null, error: { code: 'inspection-failed', message: 'Node 환경 목록 또는 저장된 선택을 확인하지 못했습니다. 다시 확인해 주세요.' } }
        activate(undefined)
      }
    })()
    discovery = request
    return request.finally(() => { if (discovery === request) discovery = null })
  }

  async function read(method: 'getState' | 'refreshCatalog') {
    if (writing || mutating) return state
    if (state.busy) {
      if (active?.kind !== 'wsl2' || state.error?.code !== 'operation-unknown') return state
      const recovered = await inspect('getState')
      if (recovered.busy || mutating || writing) return state
      await detect()
      if (!backend && recovered.error && environments.status === 'ready') publish({ ...state, error: recovered.error })
      return state
    }
    await detect()
    return inspect(method)
  }

  async function inspect(method: 'getState' | 'refreshCatalog') {
    const target = backend, command = commandGeneration
    if (target && !mutating && !writing) {
      const request = target[method]()
      inspections.add(request)
      try {
        const snapshot = await request
        if (command === commandGeneration && target === backend && !mutating && !writing) publish(snapshot)
      } finally { inspections.delete(request) }
    }
    return state
  }

  async function mutate(run: (target: Backend) => Promise<NodeManagementState>, windowsOnly = false) {
    if (busy() || discovery) return denied(nodeManagementError('busy'))
    if (!backend || !targetSelected() || (windowsOnly && active?.kind !== 'windows')) return denied(invalid('실행 중인 관리 환경을 선택해 주세요.'))
    if (options.barrier?.blocked()) return denied(nodeManagementError('shutdown'))
    ++scan
    ++commandGeneration
    mutating = true
    try {
      const snapshot = await run(backend)
      publish(snapshot)
      return state
    } finally { mutating = false }
  }

  async function openManager(expectedId: string, destination: 'folder' | 'release') {
    if (busy() || state.busy || discovery || inspections.size) return denied(nodeManagementError('busy'))
    const selected = active, target = backend, opener = options.opener
    if (!selected || !targetSelected() || selected.id !== expectedId) return denied(invalid('선택한 환경이 바뀌었습니다. 환경을 다시 확인해 주세요.'))
    if (options.barrier?.blocked()) return denied(nodeManagementError('shutdown'))
    const failed = (message: string) => denied({ code: 'operation-failed', message })
    const cannotVerify = () => denied(invalid('관리자 폴더를 확인하지 못했습니다. 선택한 환경을 다시 검사해 주세요.'))
    if (destination === 'folder') {
      if (!selected.running) return denied(invalid('환경 시작 후 열 수 있습니다.'))
      if (!state.checkedAt || state.manager.status !== 'ready' || state.error?.code === 'inspection-failed') return cannotVerify()
    }
    mutating = true
    try {
      // Registration lookup runs on the host, including for a stopped distro.
      const registered = (await options.discover()).find(e => e.id === expectedId && e.kind === selected.kind && e.distro === selected.distro)
      if (!registered) return denied(invalid('선택한 환경의 등록 정보를 다시 확인해 주세요.'))
      if (!opener) throw Error('Missing opener')
      if (destination === 'release') {
        const url = selected.kind === 'windows' ? 'https://github.com/nvm-windows/nvm/releases/latest' : 'https://github.com/nodenv/nodenv/releases/latest'
        await opener.openExternal(url)
      } else {
        if (!registered.running) return denied(invalid('환경 시작 후 열 수 있습니다.'))
        const root = await target?.verifiedManagerFolder()
        if (!root || target?.isBusy()) return cannotVerify()
        if (await opener.openPath(root)) return failed('관리자 폴더를 열지 못했습니다. 폴더 위치와 접근 권한을 확인해 주세요.')
      }
      return state
    } catch {
      return failed(destination === 'folder' ? '관리자 폴더를 열지 못했습니다. 환경과 폴더 접근 권한을 다시 확인해 주세요.' : '공식 릴리스 페이지를 열지 못했습니다. 환경과 기본 브라우저 설정을 확인해 주세요.')
    } finally { mutating = false }
  }

  return {
    currentState: () => state,
    openManagerFolder: (expectedId: string) => openManager(expectedId, 'folder'),
    openManagerRelease: (expectedId: string) => openManager(expectedId, 'release'),
    getState: () => read('getState'),
    refreshCatalog: () => read('refreshCatalog'),
    async selectEnvironment(id: string) {
      if (busy() || discovery) return denied(nodeManagementError('busy'))
      const next = environments.items.find(e => e.id === id)
      if (environments.status !== 'ready' || !isEnvironmentId(id) || !next) return denied(nodeManagementError('invalid-request'))
      writing = true
      try {
        // While writing is reserved, no new inspection can start. Finish any Windows
        // reads that could still discover a machine lock before committing another ID.
        if (active?.kind === 'windows' && id !== active.id && inspections.size) {
          await Promise.allSettled(inspections)
          if (backend?.isBusy()) return denied(nodeManagementError('busy'))
        }
        await options.store.write(id)
        saved = id
        environments = { ...environments, selectedId: id, error: null }
        activate(next)
      } catch { return denied({ code: 'operation-failed', message: '관리 환경 선택을 저장하지 못했습니다.' }) }
      finally { writing = false }
      return inspect('getState')
    },
    async startEnvironment() {
      if (busy() || discovery) return denied(nodeManagementError('busy'))
      if (!active || active.kind !== 'wsl2' || active.running || !targetSelected()) return denied(nodeManagementError('invalid-request'))
      if (options.barrier?.blocked()) return denied(nodeManagementError('shutdown'))
      const next = active
      mutating = true
      try {
        const run = () => options.start(next)
        await (options.barrier ? options.barrier.run(run) : run())
        await detect()
        if (!active?.running || active.id !== next.id) throw Error('WSL did not start')
      } catch { return denied({ code: 'operation-failed', message: '선택한 WSL 환경을 시작하지 못했습니다. 배포판 상태를 확인해 주세요.' }) }
      finally { mutating = false }
      return inspect('getState')
    },
    async cancelOperation() {
      if (!backend?.cancelOperation || !targetSelected() || !state.busy?.cancellable) return denied(nodeManagementError('invalid-request'))
      await backend.cancelOperation()
      return state
    },
    install: (version: string) => mutate(target => target.install(version)),
    use: (version: string) => mutate(target => target.use(version)),
    installManager: () => mutate(target => target.installManager(), true),
    removeStandalone: (input: StandaloneRemovalConfirmation) => mutate(target => target.removeStandalone(input), true),
    windowsSelected: () => targetSelected() && active?.kind === 'windows',
    isBusy: busy,
  }
}
