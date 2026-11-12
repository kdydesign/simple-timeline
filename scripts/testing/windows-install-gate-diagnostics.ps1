# Read-only probe appended after the actual gate's C# declaration by the CI test.
# No shutdown request, StopLegacy, TerminateProcess or file mutation is performed.
$ErrorActionPreference='Stop'
$env:PSModulePath=[IO.Path]::Combine($PSHOME,'Modules')
$report=@{engine=$PSVersionTable.PSVersion.ToString();pointerBytes=[IntPtr]::Size;psHome=$PSHOME;target=$env:PLANRAIL_TEST_TARGET;owner=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value}
$rows=[Collections.Generic.List[object]]::new();$image=$null
try {
 $image=[IO.File]::Open($env:PLANRAIL_TEST_TARGET,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
 $report.canonicalTarget=[PlanrailProcess]::Canonical($env:PLANRAIL_TEST_TARGET)
 $version=[Diagnostics.FileVersionInfo]::GetVersionInfo($env:PLANRAIL_TEST_TARGET)
 $report.productVersion=$version.ProductVersion;$report.fileVersion=$version.FileVersion
 foreach($item in @(Get-CimInstance Win32_Process -Filter "Name = 'Planrail.exe'")){
  $row=@{pid=$item.ProcessId;path=$item.ExecutablePath;created=[string]$item.CreationDate};$process=$null
  try {
   if($item.ExecutablePath){
    $row.canonical=[PlanrailProcess]::Canonical($item.ExecutablePath)
    if([String]::Equals($row.canonical,$report.canonicalTarget,[StringComparison]::OrdinalIgnoreCase)){
     # Validate the same access rights as the eligible legacy path, without stopping it.
     $process=[PlanrailProcess]::new([int]$item.ProcessId,$true)
     $row.handlePath=$process.Path;$row.owner=$process.Owner;$row.handleCreated=[string]$process.Created;$row.exited=$process.Exited
    }
   }
  }catch{$row.error=$_.Exception.Message;$row.errorId=$_.FullyQualifiedErrorId}
  finally{if($process){$process.Dispose()}}
  $rows.Add($row)
 }
}catch{$report.error=$_.Exception.Message;$report.errorId=$_.FullyQualifiedErrorId}
finally{if($image){$image.Dispose()}}
$report.rows=$rows.ToArray()
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($report|ConvertTo-Json -Depth 6 -Compress)))
