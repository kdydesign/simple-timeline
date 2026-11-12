# Drives actual assisted NSIS controls only on the disposable Windows CI desktop.
param([Parameter(Mandatory=$true)][string]$Installer,[Parameter(Mandatory=$true)][string]$Directory,[ValidateSet('On','Off','Keep')][string]$Startup='Keep',[switch]$ExpectFailure,[Parameter(Mandatory=$true)][string]$EvidenceDirectory)
$ErrorActionPreference='Stop'
if(-not $IsWindows -or $env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted'){throw 'Disposable GitHub Windows VM required'}
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Text;
using System.Runtime.InteropServices;
public sealed class PlanrailPageAdvance {
 readonly Dictionary<string,string> observed=new Dictionary<string,string>();
 readonly HashSet<string> consumed=new HashSet<string>();
 public bool Observe(string token,string fingerprint,bool eligible){
  if(!eligible){observed.Remove(token);return false;}
  if(consumed.Contains(token))return false;
  string previous;if(!observed.TryGetValue(token,out previous)||previous!=fingerprint){observed[token]=fingerprint;return false;}
  return true;
 }
 public void Consume(string token){consumed.Add(token);}
 public static bool Acknowledgement(bool modal,bool direct,bool push,bool visible,bool enabled,string text){
  string caption=(text??"").Replace("&","").Trim();
  return modal&&direct&&push&&visible&&enabled&&(String.Equals(caption,"OK",StringComparison.OrdinalIgnoreCase)||caption=="확인");
 }
}
public static class PlanrailInstallerUI {
 public delegate bool Callback(IntPtr h,IntPtr data);
 [DllImport("user32.dll")] static extern bool EnumWindows(Callback cb,IntPtr data);
 [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr h,Callback cb,IntPtr data);
 [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr h);
 [DllImport("user32.dll")] public static extern int GetSystemMetrics(int index);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out int id);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h,StringBuilder text,int count);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h,StringBuilder text,int count);
 [DllImport("user32.dll",EntryPoint="GetWindowLongW",ExactSpelling=true)] static extern int GetWindowLong(IntPtr h,int index);
 [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr h,int id);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr h);
 [DllImport("user32.dll",EntryPoint="SendMessageTimeoutW",ExactSpelling=true,SetLastError=true)] static extern IntPtr SendMessageTimeout(IntPtr h,uint msg,UIntPtr w,IntPtr l,uint flags,uint timeout,out UIntPtr result);
 [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h,uint msg,IntPtr w,IntPtr l);
 public static string Text(IntPtr h){var s=new StringBuilder(2048);GetWindowText(h,s,s.Capacity);return s.ToString();}
 public static string ClassName(IntPtr h){var s=new StringBuilder(256);GetClassName(h,s,s.Capacity);return s.ToString();}
 public static int ProcessId(IntPtr h){int pid;GetWindowThreadProcessId(h,out pid);return pid;}
 public static bool NotifyButton(IntPtr button,out bool attempted){
  attempted=false;var parent=GetParent(button);int id=GetDlgCtrlID(button);
  if(parent==IntPtr.Zero||id<=0||ClassName(button)!="Button"||!IsWindowVisible(button)||!IsWindowEnabled(button)||!IsWindowEnabled(parent))return false;
  attempted=true;UIntPtr result;return SendMessageTimeout(parent,0x111,new UIntPtr((uint)(id&65535)),button,2,1000,out result)!=IntPtr.Zero;
 }
 public static bool IsPushButton(IntPtr h){int kind=GetWindowLong(h,-16)&15;return ClassName(h)=="Button"&&(kind==0||kind==1);}
 public static IntPtr[] AllWindows(int[] pids){var list=new List<IntPtr>();EnumWindows((h,d)=>{int pid;GetWindowThreadProcessId(h,out pid);if(Array.IndexOf(pids,pid)>=0)list.Add(h);return true;},IntPtr.Zero);return list.ToArray();}
 public static IntPtr[] AllChildren(IntPtr parent){var list=new List<IntPtr>();EnumChildWindows(parent,(h,d)=>{list.Add(h);return true;},IntPtr.Zero);return list.ToArray();}
 public static bool IsCheckbox(IntPtr h){var c=new StringBuilder(256);GetClassName(h,c,c.Capacity);return c.ToString()=="Button"&&(GetWindowLong(h,-16)&15)==3;}
 public static IntPtr[] Windows(int[] pids){var list=new List<IntPtr>();EnumWindows((h,d)=>{int pid;GetWindowThreadProcessId(h,out pid);var c=new StringBuilder(256);GetClassName(h,c,c.Capacity);if(Array.IndexOf(pids,pid)>=0&&c.ToString()=="#32770"&&IsWindowVisible(h))list.Add(h);return true;},IntPtr.Zero);return list.ToArray();}
 public static IntPtr[] Children(IntPtr parent){var list=new List<IntPtr>();EnumChildWindows(parent,(h,d)=>{if(IsWindowVisible(h))list.Add(h);return true;},IntPtr.Zero);return list.ToArray();}
}
'@
$start=[Diagnostics.ProcessStartInfo]::new()
$start.FileName=$Installer;$start.Arguments='/D='+$Directory;$start.UseShellExecute=$false
[void][IO.Directory]::CreateDirectory($EvidenceDirectory)
$process=[Diagnostics.Process]::Start($start)
# Retain process objects/handles for only the installer tree created by this driver.
$owned=@{};$owned[$process.Id]=$process;$null=$process.SafeHandle
$history=[Collections.Generic.List[object]]::new();$lastProcesses=@()
function Update-OwnedProcesses {
 $script:lastProcesses=@(Get-CimInstance Win32_Process -OperationTimeoutSec 2)
 $ids=@([int]$process.Id)
 do{$before=$ids.Count;foreach($item in $script:lastProcesses){if($item.ParentProcessId -in $ids -and [int]$item.ProcessId -notin $ids){$ids+=[int]$item.ProcessId}}}while($ids.Count -ne $before)
 foreach($id in $ids){if(-not $owned.ContainsKey($id)){try{$child=[Diagnostics.Process]::GetProcessById($id);$null=$child.SafeHandle;$owned[$id]=$child}catch{# A child may already have exited.
    }}}
 return ,$ids
}
function Window-Record([IntPtr]$handle) {
 return @{handle=$handle.ToInt64();pid=[PlanrailInstallerUI]::ProcessId($handle);parent=[PlanrailInstallerUI]::GetParent($handle).ToInt64();id=[PlanrailInstallerUI]::GetDlgCtrlID($handle);class=[PlanrailInstallerUI]::ClassName($handle);text=[PlanrailInstallerUI]::Text($handle);visible=[PlanrailInstallerUI]::IsWindowVisible($handle);enabled=[PlanrailInstallerUI]::IsWindowEnabled($handle)}
}
function Failure-Evidence($errorRecord) {
 $refreshError=$null
 try{$ids=Update-OwnedProcesses}catch{$refreshError=[string]$_}
 $windows=@(foreach($handle in [PlanrailInstallerUI]::AllWindows([int[]]@($owned.Keys))){@{window=Window-Record $handle;controls=@(foreach($control in [PlanrailInstallerUI]::AllChildren($handle)){Window-Record $control})}})
 $data=@{failedAt=[DateTime]::UtcNow.ToString('o');error=[string]$errorRecord;rootPid=$process.Id;installer=$Installer;directory=$Directory;lastAction=$lastAction;startupVisited=$visited;initialChecked=$initial;foreground=Window-Record ([PlanrailInstallerUI]::GetForegroundWindow());processes=@($script:lastProcesses|Where-Object {$_.ProcessId -in @($owned.Keys)}|Select-Object ProcessId,ParentProcessId,ExecutablePath,CommandLine,CreationDate);windows=$windows;history=$history.ToArray();processRefreshError=$refreshError}
 try{
  Add-Type -AssemblyName System.Drawing
  $x=[PlanrailInstallerUI]::GetSystemMetrics(76);$y=[PlanrailInstallerUI]::GetSystemMetrics(77);$width=[PlanrailInstallerUI]::GetSystemMetrics(78);$height=[PlanrailInstallerUI]::GetSystemMetrics(79)
  $bitmap=[Drawing.Bitmap]::new($width,$height);$graphics=$null
  try{$graphics=[Drawing.Graphics]::FromImage($bitmap);$graphics.CopyFromScreen($x,$y,0,0,$bitmap.Size);$bitmap.Save((Join-Path $EvidenceDirectory 'failure.png'),[Drawing.Imaging.ImageFormat]::Png);$data.screenshot='failure.png'}finally{if($graphics){$graphics.Dispose()};$bitmap.Dispose()}
 }catch{$data.screenshotError=[string]$_}
 [IO.File]::WriteAllText((Join-Path $EvidenceDirectory 'failure.json'),($data|ConvertTo-Json -Depth 10),[Text.UTF8Encoding]::new($false))
 return $data
}
function Stop-OwnedInstallerTree {
 $errors=[Collections.Generic.List[string]]::new();$deadline=[DateTime]::UtcNow.AddSeconds(5)
 # Handles are retained, preventing PID reuse while cleanup targets these objects.
 foreach($child in @($owned.Values)){try{if(-not $child.HasExited){$child.Kill($true)}}catch{$errors.Add([string]$_)}}
 foreach($child in @($owned.Values)){try{if(-not $child.HasExited){$remaining=[Math]::Max(0,[int]($deadline-[DateTime]::UtcNow).TotalMilliseconds);if(-not $child.WaitForExit($remaining)){$errors.Add("Installer child remained live: $($child.Id)")}}}catch{$errors.Add([string]$_)}}
 return ,($errors.ToArray())
}
$initial=$null;$visited=$false;$completed=$false;$lastAction='';$runUnchecked=$false;$runLabel=$null;$advance=[PlanrailPageAdvance]::new()
try {
 $deadline=[DateTime]::UtcNow.AddSeconds(120)
 do {
  $process.Refresh()
  if($process.HasExited){$completed=$true;break}
  $pids=Update-OwnedProcesses
  foreach($window in [PlanrailInstallerUI]::Windows([int[]]$pids)) {
   $children=[PlanrailInstallerUI]::Children($window)
   $checkbox=@($children|Where-Object {[PlanrailInstallerUI]::Text($_) -eq 'Windows 로그인 시 Planrail 자동 실행'})
   if($checkbox.Count -gt 0){
    if(-not $visited){$initial=[PlanrailInstallerUI]::SendMessage($checkbox[0],0xF0,[IntPtr]::Zero,[IntPtr]::Zero).ToInt64() -eq 1;$visited=$true}
    if($Startup -ne 'Keep'){$value=if($Startup -eq 'On'){1}else{0};[void][PlanrailInstallerUI]::SendMessage($checkbox[0],0xF1,[IntPtr]$value,[IntPtr]::Zero)}
   }
   $owner=[PlanrailInstallerUI]::GetParent($window)
   $modal=$owner -ne [IntPtr]::Zero -and -not [PlanrailInstallerUI]::IsWindowEnabled($owner)
   if($modal){
    $buttons=@($children|Where-Object {[PlanrailInstallerUI]::GetParent($_) -eq $window -and [PlanrailInstallerUI]::IsPushButton($_) -and [PlanrailInstallerUI]::IsWindowVisible($_) -and [PlanrailInstallerUI]::IsWindowEnabled($_)})
    if($buttons.Count -ne 1 -or -not [PlanrailPageAdvance]::Acknowledgement($modal,$true,$true,$true,$true,[PlanrailInstallerUI]::Text($buttons[0]))){continue}
    $next=$buttons[0];$pageToken='modal:'+$window.ToInt64()
   }else{
    # Main captions change before custom-page creation; require the actual visible
    # inner dialog and never rearm that HWND after one advance, even if text changes.
    $pages=@($children|Where-Object {[PlanrailInstallerUI]::ClassName($_) -eq '#32770' -and [PlanrailInstallerUI]::GetParent($_) -eq $window})
    if($pages.Count -ne 1){continue}
    $next=[PlanrailInstallerUI]::GetDlgItem($window,1);$pageToken='page:'+$pages[0].ToInt64()
   }
   $mayAdvance=$modal -or $visited -or [PlanrailInstallerUI]::Text($next).Trim() -ne '설치'
   if($next -ne [IntPtr]::Zero -and [PlanrailInstallerUI]::Text($next) -eq '마침'){
    # Pinned MUI Finish.nsh creates a nested nsDialogs1044 checkbox dynamically.
    # Korean.nsh defines its caption as '<name> 실행하기(&R)'; no fixed child id.
    $run=@($children|Where-Object {[PlanrailInstallerUI]::IsCheckbox($_) -and [PlanrailInstallerUI]::Text($_).Contains('실행하기')})
    if($run.Count -eq 0){
     # Finish caption can change before the inner page controls finish creation.
     $mayAdvance=$false;$lastAction='finish waiting for run checkbox; controls='+(@($children|ForEach-Object {[PlanrailInstallerUI]::Text($_)}) -join '|')
    }elseif($run.Count -ne 1){throw 'Ambiguous finish run checkbox'}
    else{
     $runLabel=[PlanrailInstallerUI]::Text($run[0])
     [void][PlanrailInstallerUI]::SendMessage($run[0],0xF1,[IntPtr]::Zero,[IntPtr]::Zero)
     if([PlanrailInstallerUI]::SendMessage($run[0],0xF0,[IntPtr]::Zero,[IntPtr]::Zero).ToInt64() -ne 0){throw 'Finish run checkbox remained checked'}
     $runUnchecked=$true
    }
   }
   $eligible=$mayAdvance -and $next -ne [IntPtr]::Zero -and [PlanrailInstallerUI]::IsWindowEnabled($window) -and [PlanrailInstallerUI]::IsWindowEnabled($next)
   $fingerprint=(@($children|Sort-Object {$_.ToInt64()}|ForEach-Object {$r=Window-Record $_;'{0}|{1}|{2}|{3}|{4}' -f $r.handle,$r.id,$r.class,$r.enabled,$r.text.Trim()}) -join "`n")
   if($advance.Observe($pageToken,$fingerprint,$eligible)){
    $description=$pageToken+':'+[PlanrailInstallerUI]::Text($next).Trim()+':'+[string]$visited
    $action=@{at=[DateTime]::UtcNow.ToString('o');stage=$description;button=Window-Record $next;dialog=Window-Record $window;fingerprint=$fingerprint}
    # Bounded synchronous delivery does not queue a second click during page creation.
    $attempted=$false;$action.sent=[PlanrailInstallerUI]::NotifyButton($next,[ref]$attempted);$action.attempted=$attempted
    if($attempted){$advance.Consume($pageToken)}
    $history.Add($action);$lastAction=$description
   }
  }
  Start-Sleep -Milliseconds 100
 }while([DateTime]::UtcNow -lt $deadline)
 if(-not $completed){throw "NSIS UI lifecycle timed out; last=$lastAction; startupVisited=$visited"}
 $process.WaitForExit()
 if(-not $visited){throw 'Actual startup options page was not visited'}
 if($ExpectFailure){if($process.ExitCode -eq 0){throw 'Installer unexpectedly succeeded'}}elseif($process.ExitCode -ne 0){throw "Installer failed: $($process.ExitCode)"}elseif(-not $runUnchecked){throw 'Finish run-now choice was not verified unchecked'}
 @{initialChecked=$initial;startupPageVisited=$visited;exitCode=$process.ExitCode;startup=$Startup;finishRunUnchecked=$runUnchecked;finishRunLabel=$runLabel}|ConvertTo-Json -Compress
}catch{
 $primary=$_;$diagnostic=$null
 try{$diagnostic=Failure-Evidence $primary}catch{[Console]::Error.WriteLine("Installer diagnostic capture failed: $_")}
 try{$cleanup=Stop-OwnedInstallerTree;if($diagnostic){$diagnostic.cleanupErrors=$cleanup;[IO.File]::WriteAllText((Join-Path $EvidenceDirectory 'failure.json'),($diagnostic|ConvertTo-Json -Depth 10),[Text.UTF8Encoding]::new($false))}}catch{[Console]::Error.WriteLine("Installer cleanup/diagnostic update failed: $_")}
 throw $primary
}finally{foreach($child in @($owned.Values)){try{$child.Dispose()}catch{[Console]::Error.WriteLine("Installer handle cleanup failed: $_")}}}
