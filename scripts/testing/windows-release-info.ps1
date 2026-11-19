param([Parameter(Mandatory=$true)][string]$Installer)
$ErrorActionPreference='Stop'
$os=Get-CimInstance Win32_OperatingSystem
$cu=@(Get-ChildItem HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall -ErrorAction SilentlyContinue | Get-ItemProperty | Where-Object {$_.DisplayName -match '^(?:Simple Timeline|Planrail|WorkRail)(?: \d.*)?$'})
$lm=@(Get-ChildItem HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall -ErrorAction SilentlyContinue | Get-ItemProperty | Where-Object {$_.DisplayName -match '^(?:Simple Timeline|Planrail|WorkRail)(?: \d.*)?$'})
$shell=New-Object -ComObject WScript.Shell
$propertyShell=New-Object -ComObject Shell.Application
$shortcuts=@(foreach ($folder in @([Environment]::GetFolderPath('DesktopDirectory'),[Environment]::GetFolderPath('Programs'))) {
  Get-ChildItem -LiteralPath $folder -Filter '*.lnk' -Recurse -ErrorAction SilentlyContinue | Where-Object {$_.BaseName -in @('Simple Timeline','Planrail','WorkRail')} | ForEach-Object {
    $shortcut=$shell.CreateShortcut($_.FullName)
    $item=$propertyShell.NameSpace($_.DirectoryName).ParseName($_.Name)
    @{startMenu=($folder -eq [Environment]::GetFolderPath('Programs'));appId=$item.ExtendedProperty('System.AppUserModel.ID');description=$shortcut.Description;name=$_.BaseName;path=$_.FullName;target=$shortcut.TargetPath;iconLocation=$shortcut.IconLocation}
  }
})
@{shortcuts=$shortcuts;powershellVersion=$PSVersionTable.PSVersion.ToString();powershellEdition=$PSVersionTable.PSEdition;firewallProfiles=@(Get-NetFirewallProfile | Select-Object Name,Enabled);osCaption=$os.Caption;osVersion=$os.Version;osBuild=$os.BuildNumber;installerSignature=[string](Get-AuthenticodeSignature -LiteralPath $Installer).Status;userInstalls=@($cu | Select-Object DisplayVersion,InstallLocation);machineInstallCount=$lm.Count} | ConvertTo-Json -Depth 4 -Compress
