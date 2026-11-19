import { createHash } from 'node:crypto'
import { win32 } from 'node:path'
import { isNodeVersion } from '../../shared/node-management'
import { isSafeNvmPath, readInstalled, samePath, verifiedFiles, type WindowsProbe } from './windows-probe'
import type { WindowsDiscovery } from './discovery'
import { capabilities, modernDigest, modernHelpers } from './manager-support'

// Match the community CLI's preferences.ROOTS precedence. Read only settings
// relevant to the operation, without expanding strings from the registry.
export const modernRegistryRead = String.raw`
$settings = [ordered]@{}
$names = @('InstallRoot','OperatingMode','ActiveVersion','Enabled','MirrorNode','MirrorNpm','Proxy','AllowInsecureDownloads','AutoInstallModuleList','LocalInstallDir','LocalInstallOnly','Aliases','AllowedSigners','AuthenticodeRevocation')
foreach ($spec in @(
  @('LocalMachine','Software\Policies\Author Software\nvm'),
  @('CurrentUser','Software\Policies\Author Software\nvm'),
  @('LocalMachine','Software\Author Software\Preferences\nvm'),
  @('CurrentUser','Software\Author Software\Preferences\nvm')
)) {
  $hive = [Microsoft.Win32.RegistryHive]$spec[0]
  $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey($hive, [Microsoft.Win32.RegistryView]::Registry64)
  try {
    $key = $base.OpenSubKey($spec[1])
    if ($null -ne $key) {
      try {
        foreach ($name in $names) {
          if (!$settings.Contains($name) -and $key.GetValueNames() -contains $name) {
            if ($key.GetValueNames() -cnotcontains $name) { throw 'Ambiguous nvm registry value name' }
            $settings[$name] = $key.GetValue($name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
          }
        }
      } finally { $key.Dispose() }
    }
  } finally { $base.Dispose() }
}
$snapshot = ConvertTo-Json -InputObject $settings -Depth 3 -Compress
`

const empty = (v: unknown) => v === undefined || v === '' || (Array.isArray(v) && v.every(item => item === ''))
function official(v: unknown, url: string) {
  if (v === undefined) return true
  const entries = Array.isArray(v) ? v : [v]
  return entries.length === 1 && (entries[0] === url || entries[0] === url + '/')
}

export async function inspectModernManager(probe: WindowsProbe, home: string, result: WindowsDiscovery, searchPath: (string | null)[]) {
  const exe = win32.join(home, 'nvm.exe')
  const snapshot = await probe.readModernSettings?.()
  if (!snapshot) throw Error('Missing nvm 2.x registry preferences')
  const settings = JSON.parse(snapshot)
  const root = settings.InstallRoot
  const mode = settings.OperatingMode ?? 'shim'
  if (!isSafeNvmPath(root) || win32.normalize(root) !== root || (mode !== 'shim' && mode !== 'link')) throw Error('Invalid install layout')
  const base = win32.dirname(root)
  if (!isSafeNvmPath(base) || samePath(root, home) || !samePath(await probe.resolvePath(base), base)) throw Error('Invalid data root')
  const rootKind = await probe.pathKind(root)
  if (rootKind !== 'missing' && (rootKind !== 'directory' || !samePath(await probe.resolvePath(root), root))) throw Error('Redirected install root')
  const symlink = win32.join(base, '.nodejs')
  const active = settings.ActiveVersion === '' || settings.ActiveVersion === undefined ? null : settings.ActiveVersion
  if (active !== null && !isNodeVersion(active)) throw Error('Invalid active version')
  result.installedVersions = rootKind === 'missing' ? [] : await readInstalled(root, probe, ['node.exe'])
  result.manager = { status: 'ready', kind: 'nvm-windows', version: '2.0.1', path: exe }
  result.installation = { family: 'modern', version: '2.0.1', mode, executableDigest: modernDigest, exe, home, root, symlink, settingsDigest: createHash('sha256').update(snapshot).digest('hex') }
  result.capabilities = capabilities(null)
  const conflict = (message: string) => result.conflicts.push({ code: 'manager-configuration', path: home, message })
  if ((settings.Enabled !== undefined && settings.Enabled !== 1) || !empty(settings.Aliases)) conflict('nvm 사용 설정과 사용자 지정 버전 별칭을 확인해 주세요.')
  if (!official(settings.MirrorNode, 'https://nodejs.org/dist') || !official(settings.MirrorNpm, 'https://registry.npmjs.org')
    || !empty(settings.Proxy) || !empty(settings.LocalInstallDir) || !empty(settings.AutoInstallModuleList)
    || (settings.LocalInstallOnly ?? 0) !== 0 || (settings.AllowInsecureDownloads ?? 0) !== 0
    || !empty(settings.AllowedSigners) || (settings.AuthenticodeRevocation ?? 'online') === 'disabled') {
    result.conflicts.push({ code: 'mirror', path: null, message: '설치하려면 nvm 2.x의 공식 미러, TLS 검증 및 기본 설치 소스를 확인해 주세요.' })
  }
  if (!await verifiedFiles(probe, home, modernHelpers)) conflict('공식 nvm 2.x shim 및 utils 실행 파일을 확인해 주세요.')
  if (!searchPath.some(directory => directory && samePath(directory, symlink))) result.conflicts.push({ code: 'link-not-on-path', path: symlink, message: 'Windows PATH에 nvm 2.x의 .nodejs 경로를 추가해 주세요.' })
  const kind = await probe.pathKind(symlink)
  if (mode === 'link') {
    if (kind === 'missing' && !active) return null
    // Link mode keeps the .nodejs junction even before .link/nodejs has
    // its first version target. realpath alone cannot verify this layout.
    const inner = win32.join(base, '.link', 'nodejs')
    const immediate = kind === 'symlink' ? await probe.readLink?.(symlink) : null
    if (!immediate || !samePath(immediate, inner)) {
      conflict('nvm 2.x의 .nodejs 경로가 .link\\nodejs를 가리키는지 확인해 주세요.')
      return null
    }
    if (!active && await probe.pathKind(inner) === 'missing') return null
  }
  const target = kind === 'symlink' ? await probe.resolvePath(symlink).catch(() => null) : null
  const expectedTarget = mode === 'shim' ? win32.join(base, '.shim') : (active && win32.join(root, 'v' + active))
  if (!target || !expectedTarget || !samePath(target, expectedTarget)) {
    conflict('nvm 2.x의 .nodejs 연결 대상과 사용 모드를 확인해 주세요.')
    return null
  }
  if (mode === 'shim' && !await verifiedFiles(probe, expectedTarget, { 'node.exe': modernHelpers['.shim\\node.exe'] })) {
    conflict('nvm 2.x의 활성 Node shim을 공식 배포본과 대조할 수 없습니다.')
    return null
  }
  if (active && !result.installedVersions.includes(active)) {
    conflict('기본 Node 버전이 검증된 설치 목록에 없습니다.')
    return null
  }
  return { version: active, x64: true }
}
