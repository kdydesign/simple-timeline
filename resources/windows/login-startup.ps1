# Shared current-user contract for the packaged main process and NSIS.
param(
  [ValidateSet('Read','On','Off','Preserve','Remove')][string]$Action = $env:PLANRAIL_STARTUP_ACTION,
  [string]$Target = $env:PLANRAIL_STARTUP_TARGET,
  [switch]$InstallerState
)
# A pwsh parent can export modules for a different engine. Use this engine's built-ins.
$env:PSModulePath=[IO.Path]::Combine($PSHOME,'Modules')
$ErrorActionPreference = 'Stop'
try {
  if (-not [IO.Path]::IsPathRooted($Target)) { throw 'Absolute executable required' }
  $Target = [IO.Path]::GetFullPath($Target)
  $runPath = 'Software\Microsoft\Windows\CurrentVersion\Run'
  $approvalPath = 'Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'
  $choicePath = 'Software\Planrail'
  $command = '"' + $Target + '" --planrail-autostart'
  $root=[Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser,[Microsoft.Win32.RegistryView]::Registry64)
  $write=$Action -ne 'Read'
  $run=if($write){$root.CreateSubKey($runPath)}else{$root.OpenSubKey($runPath)}
  $choice=if($write){$root.CreateSubKey($choicePath)}else{$root.OpenSubKey($choicePath)}
  $approval=$root.OpenSubKey($approvalPath,$write)
  try {
    $previous = $(if($run){$run.GetValue('Planrail', $null)}else{$null})
    $selectedValue = $(if($choice){$choice.GetValue('StartupChoice', $null)}else{$null})
    $selected = if ($null -eq $selectedValue) { $null } else { $selectedValue -eq 1 }
    $bytes=$null; if($approval){$bytes=$approval.GetValue('Planrail',$null)}
    # StartupApproved uses 2/6 for enabled; all unknown states fail closed.
    $disabled = $null -ne $bytes -and ($bytes.Length -lt 1 -or ($bytes[0] -ne 2 -and $bytes[0] -ne 6))
    switch ($Action) {
      'On' {
        $run.SetValue('Planrail', $command, [Microsoft.Win32.RegistryValueKind]::String)
        $choice.SetValue('StartupChoice', 1, [Microsoft.Win32.RegistryValueKind]::DWord)
        if ($approval) { $approval.DeleteValue('Planrail', $false) }
      }
      'Off' {
        $run.DeleteValue('Planrail', $false)
        $choice.SetValue('StartupChoice', 0, [Microsoft.Win32.RegistryValueKind]::DWord)
      }
      'Preserve' {
        # Update/unchecked reinstallation must never remove Windows' disabled flag.
        # Relocate an existing registration only; silent new installs remain unset.
        if ($null -ne $previous) { $run.SetValue('Planrail', $command, [Microsoft.Win32.RegistryValueKind]::String) }
      }
      'Remove' {
        # Only remove this installation's registration; preserve unrelated paths.
        if ([String]::Equals($previous, $command, [StringComparison]::OrdinalIgnoreCase)) {
          $run.DeleteValue('Planrail', $false)
          if ($approval) { $approval.DeleteValue('Planrail', $false) }
          $choice.DeleteValue('StartupChoice', $false)
        } elseif ($null -eq $previous) { $choice.DeleteValue('StartupChoice', $false);if($approval){$approval.DeleteValue('Planrail',$false)} }
      }
    }
    $current = $(if($run){$run.GetValue('Planrail', $null)}else{$null})
    $selectedValue = $(if($choice){$choice.GetValue('StartupChoice', $null)}else{$null})
    $selected = if ($null -eq $selectedValue) { $null } else { $selectedValue -eq 1 }
    $bytes=$null; if($approval){$bytes=$approval.GetValue('Planrail',$null)}
    $disabled = $null -ne $bytes -and ($bytes.Length -lt 1 -or ($bytes[0] -ne 2 -and $bytes[0] -ne 6))
    if($InstallerState){
      $state=if($disabled -and $null -ne $current){'disabled'}elseif($selected -eq $false){'off'}elseif($null -ne $current){'on'}elseif($selected -eq $true){'off'}else{'unset'}
      [Console]::Out.Write($state)
      exit 0
    }
    @{selected=$selected;registered=[String]::Equals($current,$command,[StringComparison]::OrdinalIgnoreCase);disabled=$disabled} | ConvertTo-Json -Compress
  } finally { if($run){$run.Dispose()}; if($choice){$choice.Dispose()}; if ($approval) { $approval.Dispose() };$root.Dispose() }
} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 2 }
