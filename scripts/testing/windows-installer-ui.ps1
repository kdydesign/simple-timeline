# Drives actual assisted NSIS controls only on the disposable Windows CI desktop.
param([Parameter(Mandatory=$true)][string]$Installer,[Parameter(Mandatory=$true)][string]$Directory,[ValidateSet('On','Off','Keep')][string]$Startup='Keep',[switch]$ExpectFailure)
$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted'){throw 'Disposable GitHub Windows VM required'}
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Text;
using System.Runtime.InteropServices;
public static class PlanrailInstallerUI {
 public delegate bool Callback(IntPtr h,IntPtr data);
 [DllImport("user32.dll")] static extern bool EnumWindows(Callback cb,IntPtr data);
 [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr h,Callback cb,IntPtr data);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out int id);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h,StringBuilder text,int count);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h,StringBuilder text,int count);
 [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr h,int id);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr h);
 [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h,uint msg,IntPtr w,IntPtr l);
 [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h,uint msg,IntPtr w,IntPtr l);
 public static string Text(IntPtr h){var s=new StringBuilder(2048);GetWindowText(h,s,s.Capacity);return s.ToString();}
 public static IntPtr[] Windows(int[] pids){var list=new List<IntPtr>();EnumWindows((h,d)=>{int pid;GetWindowThreadProcessId(h,out pid);var c=new StringBuilder(256);GetClassName(h,c,c.Capacity);if(Array.IndexOf(pids,pid)>=0&&c.ToString()=="#32770"&&IsWindowVisible(h))list.Add(h);return true;},IntPtr.Zero);return list.ToArray();}
 public static IntPtr[] Children(IntPtr parent){var list=new List<IntPtr>();EnumChildWindows(parent,(h,d)=>{if(IsWindowVisible(h))list.Add(h);return true;},IntPtr.Zero);return list.ToArray();}
}
'@
$start=[Diagnostics.ProcessStartInfo]::new()
$start.FileName=$Installer;$start.Arguments='/D='+$Directory;$start.UseShellExecute=$false
$process=[Diagnostics.Process]::Start($start)
$initial=$null;$visited=$false;$completed=$false;$lastAction='';$lastClick=[DateTime]::MinValue
try {
 $deadline=[DateTime]::UtcNow.AddSeconds(120)
 do {
  $process.Refresh()
  if($process.HasExited){$completed=$true;break}
  $pids=@([int]$process.Id)
  # NSIS can unpack into a child process; retain only this installer tree.
  $all=@(Get-CimInstance Win32_Process)
  do{$before=$pids.Count;foreach($p in $all){if($p.ParentProcessId -in $pids -and [int]$p.ProcessId -notin $pids){$pids+=[int]$p.ProcessId}}}while($pids.Count -ne $before)
  foreach($window in [PlanrailInstallerUI]::Windows([int[]]$pids)) {
   $children=[PlanrailInstallerUI]::Children($window)
   $checkbox=@($children|Where-Object {[PlanrailInstallerUI]::Text($_) -eq 'Windows 로그인 시 Planrail 자동 실행'})
   if($checkbox.Count -gt 0){
    if(-not $visited){$initial=[PlanrailInstallerUI]::SendMessage($checkbox[0],0xF0,[IntPtr]::Zero,[IntPtr]::Zero).ToInt64() -eq 1;$visited=$true}
    if($Startup -ne 'Keep'){$value=if($Startup -eq 'On'){1}else{0};[void][PlanrailInstallerUI]::SendMessage($checkbox[0],0xF1,[IntPtr]$value,[IntPtr]::Zero)}
   }
   # The finish page uses id1204 for 'run now'; this is independent of startup.
   $run=[PlanrailInstallerUI]::GetDlgItem($window,1204)
   if($run -ne [IntPtr]::Zero -and [PlanrailInstallerUI]::IsWindowVisible($run)){[void][PlanrailInstallerUI]::SendMessage($run,0xF1,[IntPtr]::Zero,[IntPtr]::Zero)}
   $next=[PlanrailInstallerUI]::GetDlgItem($window,1)
   if($next -ne [IntPtr]::Zero -and [PlanrailInstallerUI]::IsWindowEnabled($next)){
    $description=([PlanrailInstallerUI]::Text($window))+':'+([PlanrailInstallerUI]::Text($next))+':'+[string]$visited
    if($description -ne $lastAction -or ([DateTime]::UtcNow-$lastClick).TotalMilliseconds -gt 800){
     [void][PlanrailInstallerUI]::PostMessage($next,0xF5,[IntPtr]::Zero,[IntPtr]::Zero)
     $lastAction=$description;$lastClick=[DateTime]::UtcNow
    }
   }
  }
  Start-Sleep -Milliseconds 100
 }while([DateTime]::UtcNow -lt $deadline)
 if(-not $completed){throw "NSIS UI lifecycle timed out; last=$lastAction; startupVisited=$visited"}
 $process.WaitForExit()
 if(-not $visited){throw 'Actual startup options page was not visited'}
 if($ExpectFailure){if($process.ExitCode -eq 0){throw 'Installer unexpectedly succeeded'}}elseif($process.ExitCode -ne 0){throw "Installer failed: $($process.ExitCode)"}
 @{initialChecked=$initial;startupPageVisited=$visited;exitCode=$process.ExitCode;startup=$Startup}|ConvertTo-Json -Compress
}finally{$process.Dispose()}
