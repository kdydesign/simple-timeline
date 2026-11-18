import { win32 } from 'node:path'
import { isSafeNvmPath } from './discovery'
import { INTERACTIVE_USER_SID_PATTERN, NODE_UPGRADE_CODE, type MsiEvidence } from './standalone'

/** Validate the original official package without executing it. Cached MSI bytes can
 * legitimately differ because Installer removes embedded cabinets; protected cached
 * registration + exact signed source identities form the ownership evidence instead.
 */
export function createOfficialMsiProofScript(path: string, digest: string, target: MsiEvidence): string {
  if (!isSafeNvmPath(path) || !/^[a-f0-9]{64}$/.test(digest)) throw Error('Invalid official package')
  return MSI_INSPECTION_FUNCTIONS + `
try {
  $stream = [IO.File]::Open(${literal(path)}, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
  $hash = [Security.Cryptography.SHA256]::Create()
  try { $actualHash = [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() } finally { $hash.Dispose() }
  if ($actualHash -ne ${literal(digest)} -or !(Test-OfficialSignature ${literal(path)})) { throw 'Untrusted original package' }
  $installer = New-Object -ComObject WindowsInstaller.Installer
  $db = $installer.OpenDatabase(${literal(path)}, 0)
  if ((Read-MsiValue $db "SELECT Value FROM Property WHERE Property='ProductCode'") -ine ${literal(target.productCode)}) { throw 'Product mismatch' }
  if ((Read-MsiValue $db "SELECT Value FROM Property WHERE Property='UpgradeCode'") -ine ${literal(target.upgradeCode)}) { throw 'Family mismatch' }
  if ((Read-MsiValue $db "SELECT Value FROM Property WHERE Property='ProductVersion'") -cne ${literal(target.version)}) { throw 'Version mismatch' }
  if ((Read-MsiValue $db "SELECT ComponentId FROM Component WHERE Component='NodeExecutable'") -ine ${literal(target.componentId)}) { throw 'Component mismatch' }
  if ((Read-MsiValue $db "SELECT Component_ FROM File WHERE File='node.exe'") -cne 'NodeExecutable') { throw 'File mismatch' }
  $summary = $installer.SummaryInformation(${literal(path)}, 0)
  if ($summary.Property(9) -ine ${literal(target.packageCode)} -or $summary.Property(7) -notmatch '^x64;') { throw 'Package mismatch' }
  [Console]::WriteLine('VERIFIED')
} catch { [Console]::WriteLine('UNVERIFIED') } finally { if ($stream) { $stream.Dispose() } }
`
}


// CommonApplicationData comes from the Windows known-folder API, never the app profile
// or caller environment. Only mutation metadata is stored here, never elevated code.
export const MACHINE_LOCK_CONTEXT_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$directory = [IO.Path]::Combine([Environment]::GetFolderPath('CommonApplicationData'), 'WorkRail-Node-Mutation')
if (!(Test-Path -LiteralPath $directory)) {
  [void][IO.Directory]::CreateDirectory($directory)
  $acl = New-Object Security.AccessControl.DirectorySecurity
  $acl.SetAccessRuleProtection($true, $false)
  $users = New-Object Security.Principal.SecurityIdentifier 'S-1-5-32-545'
  $creator = New-Object Security.Principal.SecurityIdentifier 'S-1-3-0'
  foreach ($sid in @('S-1-5-18', 'S-1-5-32-544')) {
    $identity = New-Object Security.Principal.SecurityIdentifier $sid
    $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'ContainerInherit, ObjectInherit', 'None', 'Allow')))
  }
  $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($users, 'ReadAndExecute', 'ContainerInherit, ObjectInherit', 'None', 'Allow')))
  $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($users, 'CreateFiles', 'None', 'None', 'Allow')))
  $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($creator, 'FullControl', 'ObjectInherit', 'InheritOnly', 'Allow')))
  Set-Acl -LiteralPath $directory -AclObject $acl
}
$acl = Get-Acl -LiteralPath $directory
if (!$acl.AreAccessRulesProtected) { throw 'Unrestricted mutation directory' }
foreach ($rule in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
  if ($rule.AccessControlType -ne 'Allow') { continue }
  $sid = $rule.IdentityReference.Value
  if ($sid -eq 'S-1-5-18' -or $sid -eq 'S-1-5-32-544') { continue }
  if ($sid -eq 'S-1-3-0' -and ($rule.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly)) { continue }
  $allowed = [Security.AccessControl.FileSystemRights]::ReadAndExecute -bor [Security.AccessControl.FileSystemRights]::CreateFiles -bor [Security.AccessControl.FileSystemRights]::Synchronize
  if ($sid -ne 'S-1-5-32-545' -or ($rule.FileSystemRights -band (-bnot $allowed))) { throw 'Unsafe mutation directory permissions' }
}
$item = Get-Item -LiteralPath $directory -Force
while ($item) {
  if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Untrusted mutation directory' }
  $item = $item.Parent
}
$boot = (Get-CimInstance -ClassName Win32_OperatingSystem).LastBootUpTime.ToUniversalTime().Ticks.ToString([Globalization.CultureInfo]::InvariantCulture)
$owner = Get-Process -Id __OWNER_PID__
$ownerStartedAt = $owner.StartTime.ToUniversalTime().Ticks.ToString([Globalization.CultureInfo]::InvariantCulture)
$userSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
[Console]::WriteLine((@{directory=$directory;boot=$boot;ownerStartedAt=$ownerStartedAt;userSid=$userSid} | ConvertTo-Json -Compress))
`

const literal = (value: string) => "'" + value.replaceAll("'", "''") + "'"
const encoded = (script: string) => ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')]

// Runs again under elevation. Never uses UninstallString or InstallLocation.
export const MSI_INSPECTION_FUNCTIONS = String.raw`
$ErrorActionPreference = 'Stop'
function Test-ProtectedFile($path) {
  $item = Get-Item -LiteralPath $path -Force
  if ($item.PSIsContainer) { return $false }
  $trusted = @('S-1-5-18', 'S-1-5-32-544', 'S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464')
  foreach ($entry in @($item, $item.Directory)) {
    $acl = Get-Acl -LiteralPath $entry.FullName
    if ($trusted -notcontains $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value) { return $false }
    foreach ($rule in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
      if ($rule.AccessControlType -eq 'Allow' -and -not ($rule.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly)) {
        $write = [Security.AccessControl.FileSystemRights]::Write -bor [Security.AccessControl.FileSystemRights]::Delete -bor [Security.AccessControl.FileSystemRights]::ChangePermissions -bor [Security.AccessControl.FileSystemRights]::TakeOwnership
        if (($rule.FileSystemRights -band $write) -and $trusted -notcontains $rule.IdentityReference.Value) { return $false }
      }
    }
  }
  while ($item) {
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { return $false }
    $parentAcl = Get-Acl -LiteralPath $item.FullName
    if ($trusted -notcontains $parentAcl.GetOwner([Security.Principal.SecurityIdentifier]).Value) { return $false }
    foreach ($rule in $parentAcl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
      $replacement = [Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor [Security.AccessControl.FileSystemRights]::Delete -bor [Security.AccessControl.FileSystemRights]::ChangePermissions -bor [Security.AccessControl.FileSystemRights]::TakeOwnership
      if ($rule.AccessControlType -eq 'Allow' -and -not ($rule.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly) -and ($rule.FileSystemRights -band $replacement) -and $trusted -notcontains $rule.IdentityReference.Value) { return $false }
    }
    if ($item -is [IO.FileInfo]) { $item = $item.Directory } else { $item = $item.Parent }
  }
  return $true
}
function Test-OfficialSignature($path, $system = $false) {
  $signature = Get-AuthenticodeSignature -LiteralPath $path
  if ($signature.Status -ne 'Valid' -or !$signature.SignerCertificate) { return $false }
  $name = $signature.SignerCertificate.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false)
  if ($system) { return $name -eq 'Microsoft Windows' -or $name -eq 'Microsoft Corporation' }
  return $name -eq 'OpenJS Foundation' -or $name -eq 'Node.js Foundation'
}
function Read-MsiValue($db, $query) {
  $view = $db.OpenView($query)
  # COM void methods can emit null records into PowerShell's success stream.
  # Suppress them so the caller receives exactly one scalar, not an array.
  try { [void]$view.Execute(); $row = $view.Fetch(); if (!$row) { throw 'Missing MSI field' }; return [string]$row.StringData(1) } finally { [void]$view.Close() }
}
function Read-NodeMsi {
  $installer = New-Object -ComObject WindowsInstaller.Installer
  $userSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $results = @()
  foreach ($code in $installer.RelatedProducts('{47C07A3A-42EF-4213-A85D-8F5A59077C28}')) {
    try {
      $package = $installer.ProductInfo($code, 'LocalPackage')
      $db = $installer.OpenDatabase($package, 0)
      $upgrade = Read-MsiValue $db "SELECT Value FROM Property WHERE Property='UpgradeCode'"
      $recordedCode = Read-MsiValue $db "SELECT Value FROM Property WHERE Property='ProductCode'"
      if ($recordedCode -ine $code) { throw 'Product mismatch' }
      $component = Read-MsiValue $db "SELECT ComponentId FROM Component WHERE Component='NodeExecutable'"
      $fileComponent = Read-MsiValue $db "SELECT Component_ FROM File WHERE File='node.exe'"
      if ($fileComponent -ne 'NodeExecutable') { throw 'File ownership mismatch' }
      $path = $installer.ComponentPath($code, $component)
      $registry = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('SOFTWARE\Node.js')
      try { $installPath = [string]$registry.GetValue('InstallPath') } finally { if ($registry) { $registry.Dispose() } }
      $scope = if ($installer.ProductInfo($code, 'AssignmentType') -eq '1') { 'machine' } else { 'user' }
      $stream = [IO.File]::OpenRead($path)
      try {
        $bytes = New-Object byte[] 64
        $pe = if ($stream.Read($bytes, 0, 64) -eq 64) { [BitConverter]::ToInt32($bytes, 60) } else { -1 }
        $x64 = $false
        if ($pe -ge 64 -and $pe + 6 -le $stream.Length) {
          $stream.Position = $pe
          if ($stream.Read($bytes, 0, 6) -eq 6) { $x64 = [BitConverter]::ToUInt32($bytes, 0) -eq 17744 -and [BitConverter]::ToUInt16($bytes, 4) -eq 34404 }
        }
      } finally { $stream.Dispose() }
      $results += @{
        productCode = [string]$code; upgradeCode = $upgrade; inspectingUserSid = $userSid
        version = Read-MsiValue $db "SELECT Value FROM Property WHERE Property='ProductVersion'"
        name = Read-MsiValue $db "SELECT Value FROM Property WHERE Property='ProductName'"
        publisher = Read-MsiValue $db "SELECT Value FROM Property WHERE Property='Manufacturer'"
        scope = $scope; nodePath = [string]$path; componentPath = [string]$path; registryPath = $installPath; componentId = $component
        nodeDigest = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
        packageSourceVerified = $false
        packageCode = [string]$installer.SummaryInformation($package, 0).Property(9)
        packageDigest = (Get-FileHash -LiteralPath $package -Algorithm SHA256).Hash.ToLowerInvariant()
        nodeSignature = Test-OfficialSignature $path
        packageSignature = Test-OfficialSignature $package
        protectedLocation = (Test-ProtectedFile $path) -and (Test-ProtectedFile $package)
        x64 = [bool]$x64
      }
    } catch { $results += @{ productCode = [string]$code; invalid = $true } }
  }
  return $results
}
`
export const MSI_INSPECTION_SCRIPT = MSI_INSPECTION_FUNCTIONS + '\n[Console]::WriteLine((ConvertTo-Json -InputObject @(Read-NodeMsi) -Compress))'

export function createMsiRemovalWorker(system: string, target: MsiEvidence): string {
  if (!/^\{[A-F0-9]{8}(?:-[A-F0-9]{4}){3}-[A-F0-9]{12}\}$/i.test(target.productCode) || target.upgradeCode.toUpperCase() !== NODE_UPGRADE_CODE) throw Error('Invalid MSI target')
  const expected = Buffer.from(JSON.stringify(target), 'utf8').toString('base64')
  const executable = win32.join(system, 'msiexec.exe')
  const worker = MSI_INSPECTION_FUNCTIONS + `
try {
  if ([Environment]::SystemDirectory -ine ${literal(system)}) { exit 41001 }
  $expected = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${expected}')) | ConvertFrom-Json
  $targets = @(Read-NodeMsi)
  if ($targets.Count -ne 1) { exit 41001 }
  $actual = $targets[0]
  foreach ($property in $expected.PSObject.Properties) {
    if ($property.Name -eq 'packageSourceVerified' -or $property.Name -eq 'officialNodeDigest' -or $property.Name -eq 'inspectingUserSid') { continue }
    if ($actual[$property.Name] -cne $property.Value) { exit 41001 }
  }
  if ($actual.nodeDigest -ne $expected.officialNodeDigest) { exit 41001 }
  if ($expected.inspectingUserSid -notmatch ${literal(INTERACTIVE_USER_SID_PATTERN)}) { exit 41001 }
  # Windows validates subauthority bounds for both local/domain and Entra identities.
  $validatedSid = New-Object Security.Principal.SecurityIdentifier $expected.inspectingUserSid
  if ($validatedSid.Value -cne $expected.inspectingUserSid) { exit 41001 }
  $originEnvironment = [Microsoft.Win32.Registry]::Users.OpenSubKey($expected.inspectingUserSid + '\\Environment')
  try { if ($originEnvironment -and ($originEnvironment.GetValue('NVM_HOME') -or $originEnvironment.GetValue('NVM_SYMLINK'))) { exit 41001 } } finally { if ($originEnvironment) { $originEnvironment.Dispose() } }
  $key = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment')
  try { if ($key.GetValue('NVM_HOME') -or $key.GetValue('NVM_SYMLINK')) { exit 41001 } } finally { $key.Dispose() }
  if (!(Test-ProtectedFile ${literal(executable)}) -or !(Test-OfficialSignature ${literal(executable)} $true)) { exit 41001 }
  $env:Path = ${literal(system)}
  $env:NODE_OPTIONS = $null
  $env:NODE_PATH = $null
  $child = Start-Process -FilePath ${literal(executable)} -WorkingDirectory ${literal(system)} -ArgumentList @('/x', ${literal(target.productCode)}, '/norestart', 'MSIRESTARTMANAGERCONTROL=Disable') -PassThru -Wait
  if ($null -eq $child.ExitCode) { exit 41002 }
  exit (50000 + $child.ExitCode)
} catch { exit 41002 }
`
  return worker
}

export function createMsiRemovalCommand(system: string, workerPath: string, digest: string): string[] {
  if (!isSafeNvmPath(system) || !isSafeNvmPath(workerPath) || !/^[a-f0-9]{64}$/.test(digest)) throw Error('Invalid verified worker')
  const bootstrap = `
$ErrorActionPreference = 'Stop'
try {
  if ([Environment]::SystemDirectory -ine ${literal(system)}) { exit 41001 }
  $env:SystemRoot = ${literal(win32.dirname(system))}
  $env:windir = $env:SystemRoot
  $env:Path = ${literal(system)}
  $env:ComSpec = ${literal(win32.join(system, 'cmd.exe'))}
  $env:PSModulePath = ${literal(win32.join(system, 'WindowsPowerShell', 'v1.0', 'Modules'))}
  Set-Location -LiteralPath ${literal(system)}
  $stream = [IO.File]::Open(${literal(workerPath)}, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
  $hash = [Security.Cryptography.SHA256]::Create()
  try { $actual = [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() } finally { $hash.Dispose() }
  if ($actual -ne ${literal(digest)}) { exit 41001 }
  $stream.Position = 0
  $reader = New-Object IO.StreamReader($stream, [Text.Encoding]::UTF8)
  & ([ScriptBlock]::Create($reader.ReadToEnd()))
} catch { exit 41001 } finally { if ($stream) { $stream.Dispose() } }
`
  const ps = win32.join(system, 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  return encoded(`
$ErrorActionPreference = 'Stop'
try {
  $child = Start-Process -FilePath ${literal(ps)} -WorkingDirectory ${literal(system)} -Verb RunAs -ArgumentList ${literal(encoded(bootstrap).join(' '))} -WindowStyle Hidden -PassThru -Wait
  if ($null -eq $child.ExitCode) { throw 'Missing worker exit' }
  if ($child.ExitCode -eq 41001) { [Console]::WriteLine('{"kind":"verification-failed"}') }
  elseif ($child.ExitCode -ge 50000 -and $child.ExitCode -le 60000) { [Console]::WriteLine((@{ kind='msi'; exitCode=($child.ExitCode - 50000) } | ConvertTo-Json -Compress)) }
  else { [Console]::WriteLine('{"kind":"unknown"}') }
} catch {
  $exception = $_.Exception
  while ($exception) {
    if ($exception -is [ComponentModel.Win32Exception] -and $exception.NativeErrorCode -eq 1223) { [Console]::WriteLine('{"kind":"uac-cancelled"}'); exit 0 }
    $exception = $exception.InnerException
  }
  [Console]::WriteLine('{"kind":"unknown"}')
}
`)
}

