param([Parameter(Mandatory=$true)][string]$Installer)
$ErrorActionPreference='Stop'
$os=Get-CimInstance Win32_OperatingSystem
$cu=@(Get-ChildItem HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall -ErrorAction SilentlyContinue | Get-ItemProperty | Where-Object {$_.DisplayName -eq 'Simple Timeline'})
$lm=@(Get-ChildItem HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall -ErrorAction SilentlyContinue | Get-ItemProperty | Where-Object {$_.DisplayName -eq 'Simple Timeline'})
@{osCaption=$os.Caption;osVersion=$os.Version;osBuild=$os.BuildNumber;installerSignature=[string](Get-AuthenticodeSignature -LiteralPath $Installer).Status;userInstalls=@($cu | Select-Object DisplayVersion,InstallLocation);machineInstallCount=$lm.Count} | ConvertTo-Json -Depth 4 -Compress
