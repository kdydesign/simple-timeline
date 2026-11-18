import { isNodeVersion, type NodeManagementError, type NodeManagementErrorCode, type NodeManagementState, type NodeOperation, type NodeRelease } from '../../shared/node-management'
import type { MutationBarrier } from '../updates/installer'
import type { NvmInstallation, WindowsDiscovery } from './discovery'

export interface ElevatedResult {
  status: 'success' | 'cancelled' | 'failed' | 'unknown' | 'download-failed' | 'integrity-failed'
}

export interface WindowsNodeAdapter {
  discover(): Promise<WindowsDiscovery>
  changeVersion(installation: NvmInstallation, command: 'install' | 'use', version: string): Promise<ElevatedResult>
  installManager(phase: (phase: NodeOperation['phase']) => void): Promise<ElevatedResult>
}

const messages: Record<NodeManagementErrorCode, string> = {
  forbidden: '허용되지 않은 Node 관리 요청입니다.',
  'invalid-request': 'Node 버전과 요청을 확인해 주세요.',
  'ipc-unavailable': 'Node 관리 응답을 확인하지 못했습니다. 다시 조회해 주세요.',
  unsupported: 'Node 관리는 Windows x64에서 사용할 수 있습니다.',
  busy: 'Node 작업이 진행 중입니다. 완료 후 다시 시도해 주세요.',
  shutdown: 'WorkRail 종료 또는 업데이트가 진행 중입니다.',
  'inspection-failed': 'Windows의 Node 환경을 읽지 못했습니다. 잠시 후 다시 검사해 주세요.',
  'catalog-unavailable': '공식 Node 배포 목록을 가져오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.',
  'manager-missing': 'nvm-windows 설치를 먼저 확인해 주세요.',
  'manager-present': '기존 nvm-windows 설치가 감지되었습니다. 현재 설치를 확인해 주세요.',
  'environment-conflict': 'Node 환경에 충돌이 있습니다. 표시된 경로와 설정을 확인한 뒤 다시 검사해 주세요.',
  'version-unavailable': '공식 배포 목록에서 이 Windows x64 버전을 찾지 못했습니다. 목록을 새로고침해 주세요.',
  'version-not-installed': '이 Windows x64 버전이 nvm에 설치되어 있지 않습니다.',
  cancelled: 'Windows 권한 요청 또는 설치가 취소되었습니다.',
  'operation-failed': 'Node 작업에 실패했습니다. Windows 권한, 인터넷 연결 및 nvm 설정을 확인해 주세요.',
  'operation-unknown': 'Node 작업이 아직 실행 중일 수 있습니다. Windows 작업 관리자에서 설치 프로그램과 승격 작업이 끝났는지 확인해 주세요. 확인한 뒤 작업 관리자에서 WorkRail을 종료하고 다시 실행해 주세요.',
  'operation-slow': '예상보다 오래 걸리고 있습니다. Windows 권한 확인 또는 설치 창을 확인해 주세요.',
  'download-failed': '공식 nvm-windows 설치 파일을 내려받지 못했습니다. 시스템 프록시가 필요한 환경에서는 브라우저로 공식 nvm-windows 1.2.2 설치 파일을 받아 설치한 뒤 다시 검사해 주세요.',
  'integrity-failed': 'nvm 실행 파일이나 설정의 무결성을 확인하지 못해 작업을 중단했습니다. 공식 nvm-windows 1.2.2 설치와 설정을 확인해 주세요.',
  'verification-failed': '요청한 변경이 적용된 것을 확인하지 못했습니다. 현재 환경과 새 터미널을 확인해 주세요.',
}

export function nodeManagementError(code: NodeManagementErrorCode): NodeManagementError {
  return { code, message: messages[code] }
}

const exitErrors = {
  cancelled: 'cancelled',
  failed: 'operation-failed',
  unknown: 'operation-unknown',
  'download-failed': 'download-failed',
  'integrity-failed': 'integrity-failed',
} as const

export function createNodeManagementService(options: {
  platform: string
  arch: string
  windows: WindowsNodeAdapter
  loadCatalog: () => Promise<NodeRelease[]>
  changed: (state: NodeManagementState) => void
  barrier?: MutationBarrier
  slowAfterMs?: number
}) {
  const { platform, arch, windows, barrier } = options
  const supported = platform === 'win32' && arch === 'x64'
  let state: NodeManagementState = {
    revision: 0,
    platform,
    supported,
    manager: { status: supported ? 'checking' : 'missing', version: null },
    activeVersion: null,
    activeSource: null,
    installedVersions: [],
    catalog: { releases: [], status: 'idle', error: null, checkedAt: null },
    busy: null,
    error: null,
    conflicts: [],
    checkedAt: null,
  }
  let inspection: Promise<WindowsDiscovery | null> | null = null
  let catalogRequest: Promise<void> | null = null

  function publish(patch: Partial<NodeManagementState>) {
    state = { ...state, ...patch, revision: state.revision + 1 }
    options.changed(state)
  }

  function inspect() {
    if (inspection) return inspection
    inspection = (async () => {
      try {
        const { installation, activeX64, ...discovery } = await windows.discover()
        publish({
          ...discovery,
          checkedAt: new Date().toISOString(),
          ...(state.error?.code === 'inspection-failed' ? { error: null } : {}),
        })
        return { installation, activeX64, ...discovery }
      } catch {
        publish({
          manager: { status: 'error', version: null },
          activeVersion: null,
          activeSource: null,
          error: nodeManagementError('inspection-failed'),
        })
        return null
      }
    })().finally(() => { inspection = null })
    return inspection
  }

  function fetchCatalog() {
    catalogRequest ??= (async () => {
      publish({ catalog: { ...state.catalog, status: 'loading', error: null } })
      try {
        const releases = await options.loadCatalog()
        publish({ catalog: { releases, status: 'ready', error: null, checkedAt: new Date().toISOString() } })
      } catch {
        publish({ catalog: { ...state.catalog, status: 'error', error: nodeManagementError('catalog-unavailable') } })
      }
    })().finally(() => { catalogRequest = null })
    return catalogRequest
  }

  function setPhase(phase: NodeOperation['phase']) {
    if (state.busy) publish({ busy: { ...state.busy, phase } })
  }

  async function perform(kind: NodeOperation['kind'], version: string | null): Promise<NodeManagementErrorCode | null> {
    let current = await inspect()
    if (!current) return 'inspection-failed'
    let outcome: ElevatedResult
    if (kind === 'install-manager') {
      if (current.manager.status !== 'missing') return 'manager-present'
      if (current.conflicts.length) return 'environment-conflict'
      outcome = await windows.installManager(setPhase)
    } else {
      if (!current.installation || current.manager.status !== 'ready') {
        return current.manager.status === 'missing' ? 'manager-missing' : 'environment-conflict'
      }
      if (current.conflicts.length) return 'environment-conflict'
      if (!isNodeVersion(version)) return 'invalid-request'
      if (kind === 'install') {
        if (current.installedVersions.includes(version)) return null
        if (state.catalog.status !== 'ready') {
          await fetchCatalog()
          current = await inspect()
          if (!current) return 'inspection-failed'
          if (!current.installation || current.manager.status !== 'ready' || current.conflicts.length) return 'environment-conflict'
          if (current.installedVersions.includes(version)) return null
        }
        if (state.catalog.status !== 'ready') return 'catalog-unavailable'
        if (!state.catalog.releases.some(release => release.version === version)) return 'version-unavailable'
      } else {
        if (!current.installedVersions.includes(version)) return 'version-not-installed'
        if (current.activeVersion === version && current.activeSource === 'nvm' && current.activeX64 !== false) return null
      }
      setPhase('waiting')
      outcome = await windows.changeVersion(current.installation, kind, version)
    }
    setPhase('verifying')
    const updated = await inspect()
    if (outcome.status !== 'success') return exitErrors[outcome.status]
    const verified = updated && updated.manager.status === 'ready' && updated.conflicts.length === 0 && (
      kind === 'install-manager' ? updated.installation !== null
        : kind === 'install' ? version !== null && updated.installedVersions.includes(version)
        : updated.activeSource === 'nvm' && updated.activeVersion === version && updated.activeX64 !== false
    )
    return verified ? null : 'verification-failed'
  }

  async function operate(kind: NodeOperation['kind'], version: string | null = null): Promise<NodeManagementState> {
    if (state.busy) return state.error?.code === 'operation-unknown' ? state : { ...state, error: nodeManagementError('busy') }
    if (barrier?.blocked()) return { ...state, error: nodeManagementError('shutdown') }
    if (!supported) return { ...state, error: nodeManagementError('unsupported') }
    if (kind !== 'install-manager' && !isNodeVersion(version)) return { ...state, error: nodeManagementError('invalid-request') }

    let resolveResult!: (value: NodeManagementState) => void
    let rejectResult!: (error: unknown) => void
    const result = new Promise<NodeManagementState>((resolve, reject) => {
      resolveResult = resolve
      rejectResult = reject
    })
    const run = async () => {
      const timer = setTimeout(() => publish({ error: nodeManagementError('operation-slow') }), options.slowAfterMs ?? 300_000)
      timer.unref()
      let code: NodeManagementErrorCode | null
      try {
        code = await perform(kind, version)
      } catch {
        setPhase('verifying')
        await inspect()
        code = 'operation-unknown'
      } finally {
        clearTimeout(timer)
      }
      if (code === 'operation-unknown') {
        setPhase('waiting')
        publish({ error: nodeManagementError(code) })
        resolveResult(state)
        // A snapshot can show the expected files before the child has exited.
        // Keep the shutdown reservation latched when its lifetime is unknown.
        await new Promise<never>(() => {})
      } else {
        publish({ busy: null, error: code ? nodeManagementError(code) : null })
        resolveResult(state)
      }
    }
    // Reserve the barrier and the operation synchronously, before another IPC request can start.
    const scheduled = barrier?.run(() => run())
    publish({ busy: { kind, version, phase: 'checking' }, error: null })
    void (scheduled ?? run()).catch(rejectResult)
    return result
  }

  return {
    async getState() {
      if (supported && !state.busy) await inspect()
      return state
    },
    async refreshCatalog() {
      if (supported && !state.busy) await Promise.all([inspect(), fetchCatalog()])
      return state
    },
    install: (version: string) => operate('install', version),
    use: (version: string) => operate('use', version),
    installManager: () => operate('install-manager'),
    isBusy: () => state.busy !== null,
  }
}

export type NodeManagementService = ReturnType<typeof createNodeManagementService>
