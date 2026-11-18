import { createHash } from 'node:crypto'
import { win32 } from 'node:path'
import { isNodeVersion } from '../../shared/node-management'
import { fetchBoundedAsset, type NodeFetch } from './catalog'
import { isSafeNvmPath, type WindowsDiscovery } from './discovery'

/** MSI family/component layout verified against official nodejs/node v20.12.2,
 * v22.9.0 and v24.11.0 tools/msvs/msi/nodemsi/product.wxs. Actual installed
 * executable hashes are obtained from that exact release's HTTPS SHASUMS.
 * Only signed, protected, per-machine x64 MSI installs can be selected.
 */
export const INTERACTIVE_USER_SID_PATTERN = '^(?:S-1-5-21|S-1-12-1)(?:-(?:0|[1-9][0-9]{0,9})){4}$'
export function isInteractiveUserSid(value: unknown): value is string {
  return typeof value === 'string' && new RegExp(INTERACTIVE_USER_SID_PATTERN).test(value)
    && value.split('-').slice(-4).every(component => Number(component) <= 0xffffffff)
}
export const NODE_UPGRADE_CODE = '{47C07A3A-42EF-4213-A85D-8F5A59077C28}'
export interface MsiEvidence {
  inspectingUserSid: string; productCode: string; upgradeCode: string; version: string; scope: string; name: string; publisher: string
  nodePath: string; componentPath: string; registryPath: string; componentId: string
  nodeDigest: string; officialNodeDigest: string; packageDigest: string
  nodeSignature: boolean; packageSignature: boolean; packageSourceVerified: boolean; packageCode: string; protectedLocation: boolean; x64: boolean
}
export interface MsiRemovalResult {
  status: 'success' | 'cancelled' | 'failed' | 'unknown' | 'integrity-failed' | 'installer-busy' | 'reboot-required'
  msiExitCode: number | null
}
const guid = /^\{[A-F0-9]{8}(?:-[A-F0-9]{4}){3}-[A-F0-9]{12}\}$/i
const samePath = (a: string, b: string) => win32.normalize(a).replace(/\\+$/, '').toLowerCase() === win32.normalize(b).replace(/\\+$/, '').toLowerCase()
export function selectStandaloneTarget(entries: MsiEvidence[], discovery: WindowsDiscovery): MsiEvidence | null {
  if (discovery.manager.status !== 'missing' || entries.length !== 1) return null
  const target = entries[0]
  if (!target || typeof target.upgradeCode !== 'string' || typeof target.nodePath !== 'string' || typeof target.componentPath !== 'string' || typeof target.registryPath !== 'string') return null
  if (!isInteractiveUserSid(target.inspectingUserSid) || !guid.test(target.productCode) || !guid.test(target.componentId) || target.upgradeCode.toUpperCase() !== NODE_UPGRADE_CODE
    || target.scope !== 'machine' || target.name !== 'Node.js' || target.publisher !== 'Node.js Foundation'
    || !isNodeVersion(target.version) || !/^[a-f0-9]{64}$/.test(target.officialNodeDigest) || target.officialNodeDigest !== target.nodeDigest || !/^[a-f0-9]{64}$/.test(target.packageDigest)
    || !target.nodeSignature || (!target.packageSignature && !target.packageSourceVerified) || !guid.test(target.packageCode) || !target.protectedLocation || !target.x64
    || !isSafeNvmPath(target.nodePath) || !samePath(target.nodePath, target.componentPath)
    || !samePath(target.nodePath, win32.join(target.registryPath, 'node.exe'))) return null
  // Refuse alternate PATH shims/other installations and unrelated occupied links.
  if (discovery.conflicts.some(conflict => conflict.path === null || !(
    samePath(conflict.path, target.nodePath) || samePath(conflict.path, win32.dirname(target.nodePath))
  ))) return null
  return target
}
export function targetFingerprint(target: MsiEvidence): string {
  return createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(target).sort(([a], [b]) => a.localeCompare(b))))).digest('hex')
}
export function readMsiResult(output: string): MsiRemovalResult {
  try {
    const result = JSON.parse(output)
    if (result.kind === 'uac-cancelled') return { status: 'cancelled', msiExitCode: null }
    if (result.kind === 'verification-failed') return { status: 'integrity-failed', msiExitCode: null }
    if (result.kind !== 'msi' || !Number.isSafeInteger(result.exitCode) || result.exitCode < 0) throw Error('Invalid bridge result')
    const code: number = result.exitCode
    return { status: code === 0 ? 'success' : code === 1602 ? 'cancelled' : code === 1618 ? 'installer-busy' : code === 3010 || code === 1641 ? 'reboot-required' : 'failed', msiExitCode: code }
  } catch { return { status: 'unknown', msiExitCode: null } }
}

export async function fetchOfficialNodeDigest(request: NodeFetch, version: string): Promise<string> {
  if (!isNodeVersion(version)) throw Error('Invalid official release version')
  const bytes = await fetchBoundedAsset(request, 'https://nodejs.org/dist/v' + version + '/SHASUMS256.txt', new Set(['https://nodejs.org']), 64 * 1024)
  const entries = bytes.toString('utf8').split(/\r?\n/).map(line => /^([a-f0-9]{64})\s+win-x64\/node\.exe$/.exec(line)).filter(Boolean)
  if (entries.length !== 1) throw Error('Ambiguous official Node digest')
  return entries[0]![1]
}

export async function fetchOfficialMsiDigest(request: NodeFetch, version: string): Promise<string> {
  if (!isNodeVersion(version)) throw Error('Invalid official release version')
  const bytes = await fetchBoundedAsset(request, 'https://nodejs.org/dist/v' + version + '/SHASUMS256.txt', new Set(['https://nodejs.org']), 64 * 1024)
  const name = 'node-v' + version + '-x64.msi'
  const entries = bytes.toString('utf8').split(/\r?\n/).map(line => /^([a-f0-9]{64})\s+(\S+)$/.exec(line)).filter(entry => entry?.[2] === name)
  if (entries.length !== 1) throw Error('Ambiguous official MSI digest')
  return entries[0]![1]
}
