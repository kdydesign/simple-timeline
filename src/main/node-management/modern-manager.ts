import { createHash } from 'node:crypto'
import { win32 } from 'node:path'
import { isNodeVersion } from '../../shared/node-management'
import { contains, isSafeNvmPath, readInstalled, samePath, verifiedFiles, type WindowsProbe } from './windows-probe'
import { setDownloadProxy, type WindowsDiscovery } from './discovery'
import { nodeSigningPolicy } from './node-signing'
import { availability, capabilities, type ModernRelease, proxyConflict } from './manager-support'

// Match the community CLI's preferences.ROOTS precedence. Read only settings
// relevant to the operation, without expanding strings from the registry.
export const modernRegistryRead = String.raw`
$settings = [ordered]@{}
$sources = [ordered]@{}
$names = @('PreviousActiveVersion','InstallRoot','OperatingMode','ActiveVersion','Enabled','MirrorNode','MirrorNpm','Proxy','ProxyAuth','ProxyAuthType','AllowInsecureDownloads','AutoInstallModuleList','LocalInstallDir','LocalInstallOnly','Aliases','AllowedSigners','AllowedThumbprints','AirGapped','AuthenticodeRevocation')
foreach ($spec in @(
  @('LocalMachine','Software\Policies\Author Software\nvm','machine-policy'),
  @('CurrentUser','Software\Policies\Author Software\nvm','user-policy'),
  @('LocalMachine','Software\Author Software\Preferences\nvm','machine-preference'),
  @('CurrentUser','Software\Author Software\Preferences\nvm','user-preference')
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
            $sources[$name] = $spec[2]
            $value = $key.GetValue($name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
            if ($name -in @('ProxyAuth','ProxyAuthType')) {
              # Only the presence of separate proxy credentials matters for installation.
              $settings[$name] = (@($value | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) }).Count -gt 0)
            } else { $settings[$name] = $value }
          }
        }
      } finally { $key.Dispose() }
    }
  } finally { $base.Dispose() }
}
# Expand only the account directories also supplied to the checked CLI process.
$root = $settings['InstallRoot']
if ($null -eq $root) { $root = '%LOCALAPPDATA%\Author Software\nvm\installs' }
if ($root -is [string]) {
  foreach ($pair in @(@('LOCALAPPDATA','LocalApplicationData'),@('APPDATA','ApplicationData'),@('USERPROFILE','UserProfile'))) {
    $prefix = '%' + $pair[0] + '%\'
    if ($root.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
      $root = [IO.Path]::Combine([Environment]::GetFolderPath($pair[1]), $root.Substring($prefix.Length))
      break
    }
  }
}
$settings['ResolvedInstallRoot'] = $root
$settings['WriteSources'] = $sources
$snapshot = ConvertTo-Json -InputObject $settings -Depth 3 -Compress
`

const empty = (v: unknown) => v === undefined || v === '' || (Array.isArray(v) && v.every(item => item === ''))
function official(v: unknown, url: string) {
  if (v === undefined) return true
  const entries = Array.isArray(v) ? v : [v]
  return entries.length === 1 && (entries[0] === url || entries[0] === url + '/')
}

// String settings in legacy REG_MULTI_SZ values use the first non-empty entry.
function registryProxy(value: unknown): unknown {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value) && value.every(entry => typeof entry === 'string')) {
    return value.map(entry => entry.trim()).find(Boolean)
  }
  return value
}

export async function inspectModernManager(probe: WindowsProbe, home: string, result: WindowsDiscovery, searchPath: (string | null)[], release: ModernRelease) {
  const exe = win32.join(home, 'nvm.exe')
  const snapshot = await probe.readModernSettings?.()
  if (!snapshot) throw Error('Missing nvm 2.x registry preferences')
  const settings = JSON.parse(snapshot)
  const root = settings.ResolvedInstallRoot ?? settings.InstallRoot
  const mode = settings.OperatingMode ?? 'shim'
  if (!isSafeNvmPath(root) || win32.normalize(root) !== root || (mode !== 'shim' && mode !== 'link')) throw Error('Invalid install layout')
  const base = win32.dirname(root)
  if (root.split('\\').some(part => ['.nodejs', '.shim', '.link', '.sync', '.verify', '.cache'].includes(part.toLowerCase()))
    || samePath(root, win32.join(home, 'utils')) || contains(win32.join(home, 'utils'), root)) throw Error('Reserved install root')
  if ((!isSafeNvmPath(base) && !/^[a-z]:\\$/i.test(base)) || samePath(root, home) || !samePath(await probe.resolvePath(base), base)) throw Error('Invalid data root')
  const rootKind = await probe.pathKind(root)
  if (rootKind !== 'missing' && (rootKind !== 'directory' || !samePath(await probe.resolvePath(root), root))) throw Error('Redirected install root')
  const symlink = win32.join(base, '.nodejs')
  const active = settings.ActiveVersion === '' || settings.ActiveVersion === undefined ? null : settings.ActiveVersion
  if (active !== null && !isNodeVersion(active)) throw Error('Invalid active version')
  const versions = rootKind === 'missing' ? [] : await readInstalled(root, probe, ['node.exe'])
  result.installedVersions = (await Promise.all(versions.map(async version =>
    await probe.completeNodePackage?.(root, version) ? version : null))).filter(v => v !== null)
  result.manager = { status: 'ready', kind: 'nvm-windows', version: release.version, path: exe }
  const signing = nodeSigningPolicy(settings)
  result.installation = { family: 'modern', signingPolicy: signing, version: release.version, mode, executableDigest: release.digest, exe, home, root, symlink, settingsDigest: createHash('sha256').update(snapshot).digest('hex') }
  result.capabilities = capabilities(null)
  const conflict = (message: string) => result.conflicts.push({ code: 'manager-configuration', path: home, message })
  const writes = settings.WriteSources
  if (!writes || typeof writes !== 'object' || Array.isArray(writes)) throw Error('Missing registry source evidence')
  const locked = ['ActiveVersion', 'PreviousActiveVersion'].find(key => writes[key] !== undefined && writes[key] !== 'user-preference')
  if (locked) result.capabilities.use = availability('Windows 정책 또는 컴퓨터 기본 설정이 ' + locked + ' 값을 관리하므로 기본 버전을 전환할 수 없습니다.')
  if (!signing) conflict('nvm 2.x의 인증서 폐지 검사와 허용된 공식 서명자 및 지문 설정을 확인해 주세요.')
  if ((settings.Enabled !== undefined && settings.Enabled !== 1) || !empty(settings.Aliases)) conflict('nvm 사용 설정과 사용자 지정 버전 별칭을 확인해 주세요.')
  const endpoint = registryProxy(settings.Proxy)
  const proxy = proxyConflict(endpoint, 'modern', !!settings.ProxyAuth || !!settings.ProxyAuthType)
  if (proxy) {
    result.conflicts.push(proxy)
    result.installation.downloadsBlocked = true
  } else if (typeof endpoint === 'string' && endpoint) setDownloadProxy(result.installation, endpoint)
  const enforced = (key: string) => ['machine-policy', 'user-policy'].includes(writes[key])
  const mirror = (enforced('MirrorNode') && !official(settings.MirrorNode, 'https://nodejs.org/dist'))
    || (enforced('MirrorNpm') && !official(settings.MirrorNpm, 'https://registry.npmjs.org'))
  let blocked: string | undefined
  if (mirror) blocked = '조직에서 지정한 nvm 미러 정책이 공식 Node ZIP 다운로드와 충돌합니다.'
  else if ((settings.AirGapped ?? 0) !== 0 || (settings.LocalInstallOnly ?? 0) !== 0) blocked = 'nvm 오프라인 또는 로컬 전용 정책에 따라 공식 Node ZIP을 다운로드할 수 없습니다.'
  else if (!empty(settings.LocalInstallDir) || !empty(settings.AutoInstallModuleList) || (settings.AllowInsecureDownloads ?? 0) !== 0) {
    blocked = '공식 ZIP 설치를 사용하려면 nvm의 TLS 검증, 로컬 설치 소스와 자동 모듈 설정을 확인해 주세요.'
  }
  if (blocked) {
    result.installation.downloadsBlocked = true
    result.conflicts.push({ code: 'mirror', path: null, message: blocked })
  }
  if (!await verifiedFiles(probe, home, release.helpers)) conflict('공식 nvm 2.x shim 및 utils 실행 파일을 확인해 주세요.')
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
  if (mode === 'shim' && !await verifiedFiles(probe, expectedTarget, { 'node.exe': release.helpers['.shim\\node.exe'] })) {
    conflict('nvm 2.x의 활성 Node shim을 공식 배포본과 대조할 수 없습니다.')
    return null
  }
  if (active && !result.installedVersions.includes(active)) {
    conflict('기본 Node 버전이 검증된 설치 목록에 없습니다.')
    return null
  }
  return { version: active, x64: true }
}
