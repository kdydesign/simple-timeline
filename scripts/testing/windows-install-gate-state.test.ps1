# Exercise the actual discovery function; CIM rows and held exit state are the only fakes.
# No Windows API or process termination is invoked.
$ErrorActionPreference='Stop'
$tokens=$null;$parseErrors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot '../../resources/windows/install-gate.ps1'),[ref]$tokens,[ref]$parseErrors)
if($parseErrors.Count){throw 'Gate parser failed'}
$function=$ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Find-Targets'},$true)
Invoke-Expression $function.Extent.Text
function Get-CimInstance {param($ClassName,$Filter) return $script:rows}
$failures=[Collections.Generic.List[string]]::new()
function Check([bool]$condition,[string]$name){if($condition){"PASS $name"}else{$failures.Add($name)}}
function Rejects([scriptblock]$action,[int]$id){try{[void](& $action);return $false}catch{return $_.Exception.Message -eq "Cannot verify process path (PID $id)"}}
$exited=[pscustomobject]@{Id=6604;Exited=$true}
$live=[pscustomobject]@{Id=6604;Exited=$false}
$script:rows=@([pscustomobject]@{ProcessId=6604;ExecutablePath=$null})
try{$found=Find-Targets -KnownHandles @($exited);Check ($found.Count -eq 0) 'previously validated held process with signaled exit skips its stale null-path row'}catch{$failures.Add('previously validated held process with signaled exit skips its stale null-path row')}
Check (Rejects {Find-Targets} 6604) 'initial discovery never skips a null path'
Check (Rejects {Find-Targets -KnownHandles @($live)} 6604) 'known live held process with null path still fails closed'
$script:rows=@([pscustomobject]@{ProcessId=6612;ExecutablePath=$null})
Check (Rejects {Find-Targets -KnownHandles @($exited)} 6612) 'unknown PID null path is never skipped because another held process exited'
$script:rows=@([pscustomobject]@{ProcessId=6604;ExecutablePath=$null},[pscustomobject]@{ProcessId=6608;ExecutablePath=$null})
$otherLive=[pscustomobject]@{Id=6608;Exited=$false}
Check (Rejects {Find-Targets -KnownHandles @($exited,$otherLive)} 6608) 'exited main row does not conceal a live child with missing identity'
$otherExited=[pscustomobject]@{Id=6608;Exited=$true}
try{$found=Find-Targets -KnownHandles @($exited,$otherExited);Check ($found.Count -eq 0) 'all previously validated held exits can clear stale main and child rows'}catch{$failures.Add('all previously validated held exits can clear stale main and child rows')}
if($failures.Count){$failures.ToArray()|ForEach-Object {[Console]::Error.WriteLine("FAIL $_")};exit 1}
