import { win32 } from 'node:path'
import { isNodeVersion, type NodeConflict, type NodeManagementState } from '../../shared/node-management'
import { compareStableVersions } from '../../shared/updates'

type PathKind = 'file' | 'directory' | 'symlink' | 'missing' | 'other'

export interface NvmInstallation {
  exe: string
  home: string
  root: string
  symlink: string
}
export interface WindowsDiscovery extends Pick<NodeManagementState, 'manager' | 'activeVersion' | 'activeSource' | 'installedVersions' | 'conflicts'> {
  installation: NvmInstallation | null
  activeX64?: false
}
export interface WindowsProbe {
  readEnvironment(): Promise<Record<string, string>>
  pathKind(path: string): Promise<PathKind>
  resolvePath(path: string): Promise<string>
  listDirectories(path: string): Promise<string[]>
  readSettings(path: string): Promise<string>
  getManagerVersion(path: string): Promise<string>
  getNodeVersion(path: string): Promise<string | null>
  isX64Node(path: string): Promise<boolean>
}

/** Restrict paths passed to nvm 1.x, which invokes cmd internally for link operations. */
export function isSafeNvmPath(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[a-z]:\\[^\\]/i.test(value)) return false
  if (/[\x00-\x1f\x7f"&|<>^%!`;$()\/]/.test(value)) return false
  return value.slice(3).split('\\').every(segment => !segment || (
    !/[ .:]$|[?:*]/.test(segment) && !/^(AUX|CON|NUL|PRN|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(segment)
  ))
}

const keyPath = (path: string) => win32.normalize(path).replace(/\\+$/, '').toLowerCase()
const samePath = (a: string, b: string) => keyPath(a) === keyPath(b)
const contains = (parent: string, child: string) => keyPath(child).startsWith(keyPath(parent) + '\\')
const localPath = (path: string) => /^[a-z]:[\\/]/i.test(path) && !/[\x00-\x1f|<>"*?]/.test(path)

function parseSettings(text: string): Map<string, string> {
  const settings = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    const match = /^([a-z_]+):(.*)$/.exec(line.trim())
    if (!match) continue
    const [, name, value] = match
    if (settings.has(name) || line.includes('$')) throw Error('Ambiguous nvm settings')
    settings.set(name, value.trim())
  }
  return settings
}

function isDefaultSource(value: string | undefined, official: string): boolean {
  return !value || value === 'none' || value === official || value === official + '/'
}

async function readInstalled(root: string, probe: WindowsProbe): Promise<string[]> {
  const versions = await Promise.all((await probe.listDirectories(root)).map(async name => {
    const version = name.slice(1)
    if (!name.startsWith('v') || !isNodeVersion(version)) return null
    for (const filename of ['node.exe', 'node64.exe']) {
      const path = win32.join(root, name, filename)
      if (await probe.pathKind(path) === 'file' && await probe.isX64Node(path)) return version
    }
    return null
  }))
  return [...new Set(versions.filter(version => version !== null))].sort((a, b) => compareStableVersions(b, a))
}

export async function discoverWindowsNode(probe: WindowsProbe): Promise<WindowsDiscovery> {
  const env = await probe.readEnvironment()
  const searchPath = (env.Path ?? '').split(';')
    .map(part => part.trim().replace(/^"(.*)"$/, '$1'))
    .filter(localPath)
    .map(part => win32.normalize(part))
  const conflicts: NodeConflict[] = []
  const result: WindowsDiscovery = {
    manager: { status: 'missing', version: null },
    activeVersion: null,
    activeSource: null,
    installedVersions: [],
    conflicts,
    installation: null,
  }
  const addConflict = (code: NodeConflict['code'], path: string | null, message: string) => conflicts.push({ code, path, message })
  const managerDirectories = env.NVM_HOME ? [env.NVM_HOME, ...searchPath] : searchPath
  const home = (await Promise.all(managerDirectories.map(async directory => {
    if (!isSafeNvmPath(directory)) return null
    const candidate = win32.join(directory, 'nvm.exe')
    return await probe.pathKind(candidate) === 'file' ? directory : null
  }))).find(directory => directory !== null)
  let linkedNode: { version: string | null; x64: boolean } | null = null
  if (home) {
    const exe = win32.join(home, 'nvm.exe')
    let version: string | null = null
    try {
      if (!samePath(await probe.resolvePath(exe), exe) || (env.NVM_HOME && !samePath(env.NVM_HOME, home))) {
        throw Error('Nvm executable and configured home do not match')
      }
      const detectedVersion = await probe.getManagerVersion(exe)
      if (!isNodeVersion(detectedVersion)) throw Error('Unrecognized nvm')
      version = detectedVersion
      if (!version.startsWith('1.')) {
        addConflict('manager-configuration', exe, 'WorkRail은 심볼릭 링크 방식의 nvm-windows 1.x를 지원합니다. 현재 nvm은 터미널에서 관리해 주세요.')
        result.manager = { status: 'error', version }
      } else {
        const configPath = win32.join(home, 'settings.txt')
        if (await probe.pathKind(configPath) !== 'file') throw Error('Missing or redirected nvm settings')
        const settings = parseSettings(await probe.readSettings(configPath))
        const root = settings.get('root')
        const configuredLink = settings.get('path')
        const symlink = env.NVM_SYMLINK || configuredLink
        if (!isSafeNvmPath(root) || !isSafeNvmPath(symlink)
          || (configuredLink && !samePath(configuredLink, symlink))
          || !samePath(await probe.resolvePath(root), root)
          || samePath(root, symlink) || contains(root, symlink) || contains(symlink, root)
          || samePath(home, symlink) || contains(home, symlink) || contains(symlink, home)) {
          throw Error('Unsafe or mismatched nvm root or link')
        }
        result.installedVersions = await readInstalled(root, probe)
        result.manager = { status: 'ready', version }
        result.installation = { exe, home, root, symlink }
        if (!isDefaultSource(settings.get('node_mirror'), 'https://nodejs.org/dist')
          || !isDefaultSource(settings.get('npm_mirror'), 'https://github.com/npm/cli/archive')
          || !isDefaultSource(settings.get('proxy'), 'none')) {
          addConflict('mirror', null, 'nvm의 Node·npm 미러 및 프록시를 기본값으로 되돌린 뒤 설치를 다시 시도해 주세요.')
        }
        const linkKind = await probe.pathKind(symlink)
        if (linkKind === 'symlink') {
          const target = await probe.resolvePath(symlink).catch(() => null)
          const name = target && win32.basename(target)
          const versionFromLink = name?.startsWith('v') ? name.slice(1) : null
          if (target && versionFromLink && isNodeVersion(versionFromLink) && samePath(win32.dirname(target), root)) {
            const node = win32.join(symlink, 'node.exe')
            if (await probe.pathKind(node) === 'file') {
              const reported = await probe.getNodeVersion(node).catch(() => null)
              linkedNode = {
                version: isNodeVersion(reported) ? reported : null,
                x64: await probe.isX64Node(node),
              }
              if (linkedNode.version && linkedNode.version !== versionFromLink) {
                addConflict('manager-configuration', node, 'Node 실행 파일의 버전과 nvm 버전 폴더가 일치하지 않습니다. nvm 설치를 확인해 주세요.')
              }
            }
          } else {
            addConflict('link-occupied', symlink, 'nvm 링크가 다른 위치를 가리킵니다. nvm 설정과 링크를 확인한 뒤 다시 검사해 주세요.')
          }
        } else if (linkKind !== 'missing') {
          addConflict('link-occupied', symlink, 'nvm 링크 위치에 기존 파일이나 폴더가 있습니다. 기존 Node 설치와 nvm 링크 경로를 확인한 뒤 다시 검사해 주세요.')
        }
        if (!searchPath.some(directory => samePath(directory, symlink))) {
          addConflict('link-not-on-path', symlink, 'Windows PATH에 nvm 링크 경로를 추가한 뒤 새 터미널에서 확인해 주세요.')
        }
      }
    } catch {
      result.manager = { status: 'error', version }
      result.installation = null
      addConflict('manager-configuration', home, 'nvm 설치 위치, settings.txt, NVM_HOME 및 NVM_SYMLINK 설정을 확인한 뒤 다시 검사해 주세요.')
    }
  } else if (env.NVM_HOME || env.NVM_SYMLINK) {
    result.manager.status = 'error'
    addConflict('manager-configuration', null, 'Windows에 남아 있는 NVM_HOME과 NVM_SYMLINK 설정 및 nvm 설치 위치를 확인해 주세요.')
  }

  const nodePaths = await Promise.all(searchPath.map(async directory => {
    for (const name of ['node.com', 'node.exe', 'node.bat', 'node.cmd']) {
      const path = win32.join(directory, name)
      const kind = await probe.pathKind(path)
      if (kind === 'file' || kind === 'symlink') return path
    }
    return null
  }))
  const nodeIndex = nodePaths.findIndex(path => path !== null)
  if (nodeIndex >= 0) {
    const path = nodePaths[nodeIndex]!
    const link = result.installation?.symlink
    const linkIndex = link ? searchPath.findIndex(directory => samePath(directory, link)) : -1
    if (linkIndex === nodeIndex && linkedNode && win32.basename(path).toLowerCase() === 'node.exe') {
      result.activeVersion = linkedNode.version
      result.activeSource = 'nvm'
      if (!linkedNode.x64) result.activeX64 = false
    } else {
      result.activeSource = 'standalone'
      const version = await probe.getNodeVersion(path).catch(() => null)
      result.activeVersion = isNodeVersion(version) ? version : null
      if (!result.installation && result.manager.status === 'missing') {
        addConflict('standalone-node', path, '기존 Node 설치가 PATH에 있습니다. Windows 설치된 앱과 PATH에서 기존 Node를 정리한 뒤 다시 검사해 주세요.')
      } else if (linkIndex > nodeIndex) {
        addConflict('path-priority', path, '이 Node 경로가 nvm 링크보다 PATH에서 앞에 있습니다. 기존 Node나 PATH 순서를 정리한 뒤 다시 검사해 주세요.')
      }
    }
  }
  return result
}
