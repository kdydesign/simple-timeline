import { win32 } from 'node:path'
import { isNodeVersion } from '../../shared/node-management'
import { compareStableVersions } from '../../shared/updates'

type PathKind = 'file' | 'directory' | 'symlink' | 'missing' | 'other'
export interface WindowsProbe {
  readEnvironment(): Promise<Record<string, string>>
  pathKind(path: string): Promise<PathKind>
  readLink?(path: string): Promise<string>
  resolvePath(path: string): Promise<string>
  listDirectories(path: string): Promise<string[]>
  readModernSettings?(): Promise<string>
  readSettings(path: string): Promise<Buffer>
  getManagerDigest(path: string): Promise<string>
  getNodeVersion(path: string): Promise<string | null>
  isX64Node(path: string): Promise<boolean>
}

/** Windows normalizes these names even inside a local WSL UNC path. */
export function isExplorerComponent(name: string): boolean {
  return name.length > 0 && !/[\\/<>:"|?*\x00-\x1f\x7f\ufffd]|[. ]$/.test(name)
    && !/^(?:AUX|CON|CONIN\$|CONOUT\$|NUL|PRN|COM[1-9¹²³]|LPT[1-9¹²³]) *(?:\.|$)/i.test(name)
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
export const samePath = (a: string, b: string) => keyPath(a) === keyPath(b)
export const contains = (parent: string, child: string) => keyPath(child).startsWith(keyPath(parent) + '\\')
export async function readInstalled(root: string, probe: WindowsProbe, filenames = ['node.exe', 'node64.exe']): Promise<string[]> {
  const versions = await Promise.all((await probe.listDirectories(root)).map(async name => {
    const version = name.slice(1)
    if (!name.startsWith('v') || !isNodeVersion(version)) return null
    for (const filename of filenames) {
      const path = win32.join(root, name, filename)
      if (await probe.pathKind(path) === 'file' && await probe.isX64Node(path) && await probe.getNodeVersion(path) === version) return version
    }
    return null
  }))
  return [...new Set(versions.filter(version => version !== null))].sort((a, b) => compareStableVersions(b, a))
}

export async function verifiedFiles(probe: WindowsProbe, directory: string, files: Record<string, string>) {
  try {
    for (const [relative, expected] of Object.entries(files)) {
      const path = win32.join(directory, relative)
      if (await probe.pathKind(path) !== 'file' || !samePath(await probe.resolvePath(path), path) || await probe.getManagerDigest(path) !== expected) return false
    }
  } catch { return false }
  return true
}
