param([Parameter(Mandatory=$true)][string]$Installer)
$ErrorActionPreference='Stop'
$os=Get-CimInstance Win32_OperatingSystem
$cu=@(Get-ChildItem HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall -ErrorAction SilentlyContinue | Get-ItemProperty | Where-Object {$_.DisplayName -match '^(?:Simple Timeline|Planrail)(?: \d.*)?$'})
$lm=@(Get-ChildItem HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall -ErrorAction SilentlyContinue | Get-ItemProperty | Where-Object {$_.DisplayName -match '^(?:Simple Timeline|Planrail)(?: \d.*)?$'})
$shell=New-Object -ComObject WScript.Shell
$shortcuts=@(foreach ($folder in @([Environment]::GetFolderPath('DesktopDirectory'),[Environment]::GetFolderPath('Programs'))) {
  Get-ChildItem -LiteralPath $folder -Filter '*.lnk' -Recurse -ErrorAction SilentlyContinue | Where-Object {$_.BaseName -in @('Simple Timeline','Planrail')} | ForEach-Object {
    @{name=$_.BaseName;path=$_.FullName;target=$shell.CreateShortcut($_.FullName).TargetPath}
  }
})
@{shortcuts=$shortcuts;powershellVersion=$PSVersionTable.PSVersion.ToString();powershellEdition=$PSVersionTable.PSEdition;firewallProfiles=@(Get-NetFirewallProfile | Select-Object Name,Enabled);osCaption=$os.Caption;osVersion=$os.Version;osBuild=$os.BuildNumber;installerSignature=[string](Get-AuthenticodeSignature -LiteralPath $Installer).Status;userInstalls=@($cu | Select-Object DisplayVersion,InstallLocation);machineInstallCount=$lm.Count} | ConvertTo-Json -Depth 4 -Compress
