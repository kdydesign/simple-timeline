import { createHash } from 'node:crypto'
import { win32 } from 'node:path'
import { isNodeVersion, type NodeConflict, type NodeManagementState } from '../../shared/node-management'
import { compareStableVersions } from '../../shared/updates'

type PathKind = 'file' | 'directory' | 'symlink' | 'missing' | 'other'
export const NVM_VERSION = '1.2.2'
// nvm.exe from the official 1.2.2 nvm-noinstall.zip release asset.
export const NVM_EXE_DIGEST = '665b0b033e88098367381e929b71cfc96dc4058a3cb6fef760a0ccc9a883dd13'

export interface NvmInstallation {
  exe: string
  home: string
  root: string
  symlink: string
  settingsDigest: string
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
  readSettings(path: string): Promise<Buffer>
  getManagerDigest(path: string): Promise<string>
  getNodeVersion(path: string): Promise<string | null>
  isX64Node(path: string): Promise<boolean>
}

/** Restrict paths passed to nvm 1.x, which invokes cmd internally for link operations. */
export function isSafeNvmPath(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[a-z]:\\[^\\]/i.test(value)) return false
  if (/[\x00-\x1f\x7f"&|<>^%!`;$()\/]/.test(value)) return false
  return value.slice(3).split('\\').every(segment => !segment || (
    !/[ .]$|[?:*]/.test(segment) && !/^(AUX|CON|NUL|PRN|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(segment)
  ))
}

const keyPath = (path: string) => win32.normalize(path).replace(/\\+$/, '').toLowerCase()
const samePath = (a: string, b: string) => keyPath(a) === keyPath(b)
const contains = (parent: string, child: string) => keyPath(child).startsWith(keyPath(parent) + '\\')
const localPath = (path: string) => /^[a-z]:[\\/]/i.test(path) && !/[\x00-\x1f|<>"*?]/.test(path)

function parseSettings(bytes: Buffer): Map<string, string> {
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  // The CLI expands environment variables before parsing keys. Reject
  // expansion or ambiguous markup anywhere in the original configuration.
  if (/[$\x00\ufeff]/.test(text)) throw Error('Ambiguous nvm settings')
  const settings = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const match = /^[\t ]*([a-z_]+):([^\r]*?)[\t ]*$/.exec(line)
    if (!match) throw Error('Malformed nvm settings')
    const [, name, value] = match
    if (settings.has(name)) throw Error('Ambiguous nvm settings')
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
      if (await probe.pathKind(path) === 'file' && await probe.isX64Node(path) && await probe.getNodeVersion(path) === version) return version
    }
    return null
  }))
  return [...new Set(versions.filter(version => version !== null))].sort((a, b) => compareStableVersions(b, a))
}

export async function discoverWindowsNode(probe: WindowsProbe): Promise<WindowsDiscovery> {
  const env = await probe.readEnvironment()
  const pathEntries = (env.Path ?? '').split(';')
    .map(part => part.trim().replace(/^"(.*)"$/, '$1'))
    .filter(Boolean)
  const searchPath = pathEntries.map(part => localPath(part) && !part.includes('%') ? win32.normalize(part) : null)
  const extensions = (env.PATHEXT || '.COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC')
    .split(';').map(value => value.trim().toLowerCase())
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
      if (await probe.getManagerDigest(exe) !== NVM_EXE_DIGEST) {
        addConflict('manager-configuration', exe, '기존 nvm 실행 파일을 확인했습니다. WorkRail에서 관리하려면 공식 nvm-windows 1.2.2 실행 파일이 필요합니다.')
        result.manager = { status: 'error', version }
      } else {
        version = NVM_VERSION
        const configPath = win32.join(home, 'settings.txt')
        if (await probe.pathKind(configPath) !== 'file') throw Error('Missing or redirected nvm settings')
        const settingsBytes = await probe.readSettings(configPath)
        const settings = parseSettings(settingsBytes)
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
        result.installation = { exe, home, root, symlink, settingsDigest: createHash('sha256').update(settingsBytes).digest('hex') }
        const proxy = settings.get('proxy')
        if (!isDefaultSource(settings.get('node_mirror'), 'https://nodejs.org/dist')
          || !isDefaultSource(settings.get('npm_mirror'), 'https://github.com/npm/cli/archive')
          || (proxy && proxy !== 'none')) {
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
        if (!searchPath.some(directory => directory && samePath(directory, symlink))) {
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

  const badExtensions = extensions.some(extension => !/^\.[a-z0-9]{1,8}$/.test(extension))
  const nodePaths = await Promise.all(searchPath.map(async directory => {
    if (!directory || badExtensions) return null
    for (const extension of extensions) {
      const path = win32.join(directory, 'node' + extension)
      const kind = await probe.pathKind(path)
      if (kind === 'file' || kind === 'symlink') return path
    }
    return null
  }))
  const nodeIndex = nodePaths.findIndex(path => path !== null)
  const link = result.installation?.symlink
  const linkIndex = link ? searchPath.findIndex(directory => directory && samePath(directory, link)) : -1
  const uncertainIndex = searchPath.indexOf(null)
  const precedesNode = uncertainIndex >= 0 && (nodeIndex < 0 || uncertainIndex < nodeIndex)
  if (badExtensions || precedesNode || (uncertainIndex >= 0 && linkIndex > uncertainIndex)) {
    addConflict('path-priority', badExtensions ? null : pathEntries[uncertainIndex], '로컬 절대 경로와 Windows PATHEXT 설정을 확인해 주세요. 현재 PATH의 Node 우선순위를 확정할 수 없습니다.')
    return result
  }
  if (link && !extensions.includes('.exe')) {
    addConflict('path-priority', link, 'Windows PATHEXT에 .EXE를 추가한 뒤 다시 검사해 주세요.')
  }
  if (nodeIndex >= 0) {
    const path = nodePaths[nodeIndex]!
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
      } else if (linkIndex > nodeIndex || (linkIndex === nodeIndex && win32.basename(path).toLowerCase() !== 'node.exe')) {
        addConflict('path-priority', path, '이 Node 경로가 nvm 링크보다 PATH에서 앞에 있습니다. 기존 Node나 PATH 순서를 정리한 뒤 다시 검사해 주세요.')
      }
    }
  }
  return result
}
