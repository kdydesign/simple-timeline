# Only the approved 0.8.0 legacy version may be terminated.
# Runs before NSIS replaces any installed file. No privilege or policy changes.
param([string]$Target=$env:PLANRAIL_INSTALL_TARGET,[switch]$Manual)
# A pwsh parent can export modules for a different engine. Use this engine's built-ins.
$env:PSModulePath=[IO.Path]::Combine($PSHOME,'Modules')
$ErrorActionPreference='Stop'
if ($env:PLANRAIL_INSTALL_MANUAL -eq '1') { $Manual=$true }
try {
  if (-not [IO.Path]::IsPathRooted($Target)) { throw 'Absolute installation target required' }
  $Target=[IO.Path]::GetFullPath($Target)
  Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Principal;
public sealed class PlanrailProcess : IDisposable {
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, int id);
  [DllImport("kernel32.dll", EntryPoint="QueryFullProcessImageNameW", CharSet=CharSet.Unicode, ExactSpelling=true, SetLastError=true)] static extern bool QueryFullProcessImageName(IntPtr h, int flags, StringBuilder path, ref int size);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetProcessTimes(IntPtr h, out long created, out long exited, out long kernel, out long user);
  [DllImport("kernel32.dll", EntryPoint="GetFinalPathNameByHandleW", CharSet=CharSet.Unicode, ExactSpelling=true, SetLastError=true)] static extern uint GetFinalPathNameByHandle(IntPtr h, StringBuilder path, uint size, uint flags);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool OpenProcessToken(IntPtr h, uint access, out IntPtr token);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateProcess(IntPtr h, uint code);
  [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForSingleObject(IntPtr h, uint milliseconds);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  IntPtr handle; public readonly int Id; public readonly string Path; public readonly long Created; public readonly string Owner;
  static Exception Error() { return new Win32Exception(Marshal.GetLastWin32Error()); }
  public static string Canonical(string path) {
    using (var f = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete)) {
      var text = new StringBuilder(32768); uint size=GetFinalPathNameByHandle(f.SafeFileHandle.DangerousGetHandle(),text,32768,0);
      if(size==0 || size>=32768) throw Error(); string result=text.ToString();
      if(result.StartsWith(@"\\?\UNC\",StringComparison.OrdinalIgnoreCase)) return @"\\"+result.Substring(8);
      return result.StartsWith(@"\\?\",StringComparison.OrdinalIgnoreCase)?result.Substring(4):result;
    }
  }
  public PlanrailProcess(int id, bool canTerminate) {
    Id=id; handle=OpenProcess(0x1000|0x100000|(canTerminate?1u:0u),false,id); if(handle==IntPtr.Zero) throw Error();
    try {
      var text=new StringBuilder(32768); int size=text.Capacity;
      if(!QueryFullProcessImageName(handle,0,text,ref size)) throw Error(); Path=Canonical(text.ToString());
      long exited,kernel,user; if(!GetProcessTimes(handle,out Created,out exited,out kernel,out user)) throw Error();
      IntPtr token; if(!OpenProcessToken(handle,8,out token)) throw Error();
      try { using(var identity=new WindowsIdentity(token)) { Owner=identity.User.Value; } } finally { CloseHandle(token); }
    } catch { Dispose(); throw; }
  }
  public bool Exited { get { uint result=WaitForSingleObject(handle,0); if(result==0xffffffff) throw Error(); return result==0; } }
  public void StopLegacy(string target, string owner, long created) {
    if(!String.Equals(Path,target,StringComparison.OrdinalIgnoreCase)||Owner!=owner||Created!=created) throw new InvalidOperationException("Process identity changed");
    long now,exited,kernel,user; if(!GetProcessTimes(handle,out now,out exited,out kernel,out user)||now!=Created) throw Error();
    if(!Exited && !TerminateProcess(handle,2)) throw Error();
  }
  public void Dispose() { if(handle!=IntPtr.Zero) { CloseHandle(handle); handle=IntPtr.Zero; } }
}
'@
  # Enumeration only discovers candidates. Authorization uses the held native handle.
  function Find-Targets {
    $result=New-Object System.Collections.Generic.List[object]
    try {
      foreach($item in @(Get-CimInstance Win32_Process -Filter "Name = 'Planrail.exe'")) {
        if (-not $item.ExecutablePath) { throw 'Cannot verify process path' }
        if (-not [String]::Equals([PlanrailProcess]::Canonical($item.ExecutablePath),$canonical,[StringComparison]::OrdinalIgnoreCase)) { continue }
        $process=$null
        try { $process=[PlanrailProcess]::new([int]$item.ProcessId,[bool]$forceLegacy) }
        catch {
          # A process may exit between CIM enumeration and handle acquisition.
          if (-not (Get-Process -Id $item.ProcessId -ErrorAction SilentlyContinue)) { continue }; throw
        }
        if (-not [String]::Equals($process.Path,$canonical,[StringComparison]::OrdinalIgnoreCase) -or $process.Owner -ne $owner) { $process.Dispose();throw 'Cannot authorize process identity' }
        $result.Add($process)
      }
      return ,$result
    } catch { foreach($process in $result){$process.Dispose()};throw }
  }
  if (-not (Test-Path -LiteralPath $Target -PathType Leaf)) {
    # A missing target is safe only when no process reports this exact path.
    foreach($item in @(Get-CimInstance Win32_Process -Filter "Name = 'Planrail.exe'")) {
      if (-not $item.ExecutablePath -or [String]::Equals([IO.Path]::GetFullPath($item.ExecutablePath),$Target,[StringComparison]::OrdinalIgnoreCase)) { throw 'Missing image for an active process' }
    }
    exit 0
  }
  # Hold the image against replacement while checking its version and process identity.
  $image=[IO.File]::Open($Target,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
  $handles=New-Object System.Collections.Generic.List[object]
  try {
    $canonical=[PlanrailProcess]::Canonical($Target)
    $owner=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $versionText=[Diagnostics.FileVersionInfo]::GetVersionInfo($Target).ProductVersion
    $legacy=$versionText -match '^0\.8\.0(?:\.0)?$'
    $version=$null
    $supported=[Version]::TryParse($versionText,[ref]$version) -and $version -ge [Version]'0.8.1'
    $forceLegacy=$Manual -and $legacy
    $handles=Find-Targets
    if ($handles.Count -eq 0) { exit 0 }
    if ($Manual) {
      if ($forceLegacy) {
        # All matching handles and owners were validated before stopping any process.
        foreach($process in $handles) { $process.StopLegacy($canonical,$owner,$process.Created) }
      } elseif ($supported) {
        $request=New-Object Diagnostics.ProcessStartInfo
        $request.FileName=$Target
        $request.UseShellExecute=$false
        $request.Arguments='--planrail-install-exit --planrail-install-target "'+$Target+'"'
        $request.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
        $child=[Diagnostics.Process]::Start($request)
        try { if(-not $child.WaitForExit(10000) -or $child.ExitCode -ne 0){throw 'Graceful shutdown request failed'} } finally { $child.Dispose() }
      } else { throw 'Unsupported running app version' }
    }
    $deadline=[DateTime]::UtcNow.AddSeconds(30)
    do {
      $remaining=Find-Targets
      try { $alive=@($handles | Where-Object {-not $_.Exited}).Count -gt 0 -or $remaining.Count -gt 0 }
      finally { foreach($process in $remaining){$process.Dispose()} }
      if(-not $alive){exit 0}
      Start-Sleep -Milliseconds 200
    } while([DateTime]::UtcNow -lt $deadline)
    throw 'Planrail did not complete safe shutdown'
  } finally { foreach($process in $handles){$process.Dispose()};$image.Dispose() }
} catch { [Console]::Error.WriteLine($_.Exception.Message);exit 2 }
