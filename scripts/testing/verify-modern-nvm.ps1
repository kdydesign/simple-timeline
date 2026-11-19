param(
  [Parameter(Mandatory)][ValidateSet('shim', 'link')][string]$Mode,
  [switch]$AsStandardUser,
  [string]$TestNode
)
$ErrorActionPreference = 'Stop'
# A check-run annotation survives even when GitHub's raw log download is unavailable.
trap {
  $message = $_.Exception.Message.Replace('%','%25').Replace("`r",'%0D').Replace("`n",'%0A')
  $line = $_.InvocationInfo.ScriptLineNumber
  [Console]::WriteLine("::error file=scripts/testing/verify-modern-nvm.ps1,line=$line,title=nvm 2.0.1 ${Mode}::${message}")
  break
}
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
  throw 'A disposable GitHub-hosted Windows VM is required'
}
$system = [Environment]::SystemDirectory
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if ($AsStandardUser) {
  if ($isAdmin -or $identity.Name -ne "$env:COMPUTERNAME\WorkRailZipCI") { throw 'Expected the isolated standard account' }
  # A first, non-interactive logon may not have created the known AppData folders.
  # Use Windows' registered profile for this token, before resolving any shell paths.
  $profileKey = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\' + $identity.User.Value
  $env:USERPROFILE = Get-ItemPropertyValue -LiteralPath $profileKey -Name ProfileImagePath
  $env:LOCALAPPDATA = Join-Path $env:USERPROFILE 'AppData\Local'
  $env:APPDATA = Join-Path $env:USERPROFILE 'AppData\Roaming'
  $env:TEMP = Join-Path $env:LOCALAPPDATA 'Temp'
  [IO.Directory]::CreateDirectory($env:APPDATA) | Out-Null
  [IO.Directory]::CreateDirectory($env:TEMP) | Out-Null
  $env:TMP = $env:TEMP
  $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine')
  Remove-Item Env:NVM_HOME,Env:NVM_SYMLINK -ErrorAction SilentlyContinue
  $installer = Join-Path $env:TEMP 'nvm-2.0.1-x64-setup.exe'
  $url = 'https://github.com/nvm-windows/nvm/releases/download/v2.0.1/nvm-2.0.1-x64-setup.exe'
  Invoke-WebRequest -UseBasicParsing $url -OutFile $installer
  if ((Get-FileHash $installer).Hash -ne '2ba6ab6290fdc7d1e608e76c97577ca6e1df772b2d59ab8ebc01e10788de8e57') {
    throw 'Unexpected nvm 2.0.1 installer'
  }
  $setupLog = Join-Path $env:TEMP 'workrail-nvm-setup.log'
  $setupArgs = @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/OFFICIALNODE=ignore',('/LOG="' + $setupLog + '"'))
  $setup = Start-Process -FilePath $installer -ArgumentList $setupArgs -Wait -PassThru
  if ($setup.ExitCode -ne 0) {
    $detail = ''
    if (Test-Path -LiteralPath $setupLog) {
      $detail = (Select-String -LiteralPath $setupLog -Pattern 'exception|error|failed|aborted' | Select-Object -Last 5 -ExpandProperty Line) -join ' | '
    }
    throw "nvm installer exited $($setup.ExitCode). $detail"
  }
  $env:NVM_HOME = [Environment]::GetEnvironmentVariable('NVM_HOME','User')
  $env:Path += ';' + [Environment]::GetEnvironmentVariable('Path','User')
  $nvm = Join-Path $env:NVM_HOME 'nvm.exe'
  if ($Mode -eq 'link') {
    & $nvm use link
    if ($LASTEXITCODE -ne 0) { throw 'nvm could not enter link mode' }
  }
  $env:WORKRAIL_TEST_NVM_MODERN_MODE = $Mode
  & $TestNode node_modules/vitest/vitest.mjs run --config vitest.config.mts tests/unit/node-zip-windows.test.ts
  exit $LASTEXITCODE
}

if (-not $isAdmin) { throw 'The runner administrator must prepare the isolated standard account' }
$account = 'WorkRailZipCI'
$workspace = (Get-Location).Path
$node = (Get-Command node.exe).Source
# Discovery reads the machine PATH before the account PATH. Keep the runner's
# preinstalled standalone Node out of this dedicated VM's test environment.
$machineEnvironment = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('SYSTEM\CurrentControlSet\Control\Session Manager\Environment', $true)
$previousPath = $machineEnvironment.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
$previousKind = $machineEnvironment.GetValueKind('Path')
$password = ConvertTo-SecureString ('Wr9!' + [Guid]::NewGuid().ToString('N')) -AsPlainText -Force
$user = New-LocalUser -Name $account -Password $password
try {
  $users = Get-LocalGroup -SID 'S-1-5-32-545'
  if ((Get-LocalGroupMember -Group $users).SID -notcontains $user.SID) {
    Add-LocalGroupMember -Group $users -Member $user
  }
  $access = '*' + $user.SID.Value + ':(OI)(CI)M'
  & icacls.exe $workspace /grant $access | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to grant the CI account access to the test workspace' }
  $machineEnvironment.SetValue('Path', "$system;$env:SystemRoot;$system\Wbem;$system\WindowsPowerShell\v1.0", $previousKind)
  Start-Service seclogon
  $credential = [pscredential]::new("$env:COMPUTERNAME\$account", $password)
  $arguments = @('-NoProfile','-NonInteractive','-File', ('"' + $PSCommandPath + '"'),
    '-AsStandardUser','-Mode',$Mode,'-TestNode', ('"' + $node + '"'))
  $out = Join-Path $env:RUNNER_TEMP 'modern-nvm-test.log'
  $err = Join-Path $env:RUNNER_TEMP 'modern-nvm-test.err'
  $workerEnvironment = @{
    GITHUB_ACTIONS = $env:GITHUB_ACTIONS
    RUNNER_OS = $env:RUNNER_OS
    RUNNER_ENVIRONMENT = $env:RUNNER_ENVIRONMENT
  }
  # The upstream installer requests optional machine event-log registration, even in silent mode.
  # Deny elevation requests from standard users on this disposable VM while the fixture runs.
  $policy = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System', $true)
  $consent = 'ConsentPromptBehaviorUser'
  try {
    $hadConsent = $policy.GetValueNames() -contains $consent
    if ($hadConsent) {
      $originalConsent = $policy.GetValue($consent, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
      $originalKind = $policy.GetValueKind($consent)
    }
    try {
      $policy.SetValue($consent, 0, [Microsoft.Win32.RegistryValueKind]::DWord)
      $child = Start-Process -FilePath "$system\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList $arguments -Credential $credential -LoadUserProfile -Environment $workerEnvironment -WorkingDirectory $workspace -RedirectStandardOutput $out -RedirectStandardError $err -Wait -PassThru
    } finally {
      if ($hadConsent) { $policy.SetValue($consent, $originalConsent, $originalKind) }
      else { $policy.DeleteValue($consent, $false) }
    }
  } finally { $policy.Dispose() }
  Get-Content -LiteralPath $out
  $workerErrors = @(Get-Content -LiteralPath $err)
  $workerErrors | Write-Output
  if ($child.ExitCode -ne 0) {
    $detail = ($workerErrors | Select-Object -First 5) -join ' '
    throw "Standard-user acceptance exited $($child.ExitCode). $detail"
  }
} finally {
  try { $machineEnvironment.SetValue('Path', $previousPath, $previousKind) } finally { $machineEnvironment.Dispose() }
  Remove-LocalUser -Name $account
}
