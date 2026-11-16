# Exercise the actual discovery function; CIM rows and held exit state are the only fakes.
# No Windows API or process termination is invoked.
$ErrorActionPreference='Stop'
$tokens=$null;$parseErrors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot '../../resources/windows/install-gate.ps1'),[ref]$tokens,[ref]$parseErrors)
if($parseErrors.Count){throw 'Gate parser failed'}
$function=$ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Find-Targets'},$true)
Invoke-Expression $function.Extent.Text
$aliveAssignment=$ast.Find({param($node) $node -is [Management.Automation.Language.AssignmentStatementAst] -and $node.Left -is [Management.Automation.Language.VariableExpressionAst] -and $node.Left.VariablePath.UserPath -eq 'alive'},$true)
if(-not $aliveAssignment){throw 'Exit verification predicate missing'}
$aliveCheck=[scriptblock]::Create($aliveAssignment.Extent.Text)
function Test-ExitVerification($handles){
 $remaining=Find-Targets -KnownHandles ($handles)
 . $aliveCheck
 return -not $alive
}
function Get-CimInstance {param($ClassName,$Filter) return $script:rows}
$failures=[Collections.Generic.List[string]]::new()
function Check([bool]$condition,[string]$name){if($condition){"PASS $name"}else{$failures.Add($name)}}
function Rejects([scriptblock]$action,[int]$id){try{[void](& $action);return $false}catch{return $_.Exception.Message -eq "Cannot verify process path (PID $id)"}}
$exited=[pscustomobject]@{Id=6604;Exited=$true}
$live=[pscustomobject]@{Id=6604;Exited=$false}
$script:rows=@([pscustomobject]@{ProcessId=6604;ExecutablePath=$null})
try{$found=Find-Targets -KnownHandles @($exited);Check ($found.Count -eq 0) 'previously validated held process with signaled exit skips its stale null-path row'}catch{$failures.Add('previously validated held process with signaled exit skips its stale null-path row')}
Check (Rejects {Find-Targets} 6604) 'initial discovery never skips a null path'
try{Check (-not (Test-ExitVerification @($live))) 'known held process with null path waits for its actual exit signal'}catch{$failures.Add('known held process with null path waits for its actual exit signal')}
$script:rows=@([pscustomobject]@{ProcessId=6612;ExecutablePath=$null})
Check (Rejects {Find-Targets -KnownHandles @($exited)} 6612) 'unknown PID null path is never skipped because another held process exited'
$script:rows=@([pscustomobject]@{ProcessId=6604;ExecutablePath=$null},[pscustomobject]@{ProcessId=6608;ExecutablePath=$null})
$otherLive=[pscustomobject]@{Id=6608;Exited=$false}
try{Check (-not (Test-ExitVerification @($exited,$otherLive))) 'exited main does not allow replacement while held child is still exiting'}catch{$failures.Add('exited main does not allow replacement while held child is still exiting')}
$otherExited=[pscustomobject]@{Id=6608;Exited=$true}
try{$found=Find-Targets -KnownHandles @($exited,$otherExited);Check ($found.Count -eq 0) 'all previously validated held exits can clear stale main and child rows'}catch{$failures.Add('all previously validated held exits can clear stale main and child rows')}
$script:rows=@()
Check (-not (Test-ExitVerification @($live))) 'CIM disappearance alone cannot complete shutdown before held exit signal'
$script:rows=@([pscustomobject]@{ProcessId=6604;ExecutablePath=$null})
$transition=[pscustomobject]@{Id=6604;Exited=$false}
try{
 Check (-not (Test-ExitVerification @($transition))) 'termination in progress remains pending'
 $transition.Exited=$true
 Check (Test-ExitVerification @($transition)) 'same held process completes only after native exit signal'
}catch{$failures.Add('termination transition must wait then complete without missing-path failure')}
$broken=[pscustomobject]@{Id=6604}
$broken|Add-Member ScriptProperty Exited {throw 'Native wait failed'}
try{Check (-not (Test-ExitVerification @($broken))) 'unreadable exit state never permits replacement'}catch{Check ($_.Exception.Message -match 'Native wait failed') 'native wait failure still prevents replacement'}
if($failures.Count){$failures.ToArray()|ForEach-Object {[Console]::Error.WriteLine("FAIL $_")};exit 1}
