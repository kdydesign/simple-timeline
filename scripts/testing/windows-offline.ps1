param([Parameter(Mandatory=$true)][string]$Program,[Parameter(Mandatory=$true)][ValidateSet('Add','Remove')][string]$Action,[Parameter(Mandatory=$true)][string]$RuleName)
$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {throw 'Firewall test requires a disposable GitHub-hosted Windows VM'}
if($Action -eq 'Remove') {Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule; exit 0}
$resolved=[IO.Path]::GetFullPath($Program)
if(-not (Test-Path -LiteralPath $resolved)) {throw 'Packaged executable missing'}
$enabled=Get-NetFirewallProfile | Where-Object {$_.Enabled}
if(-not $enabled) {throw 'Windows firewall is disabled; cannot claim enforced offline verification'}
New-NetFirewallRule -DisplayName $RuleName -Direction Outbound -Action Block -Program $resolved -Profile Any | Out-Null
