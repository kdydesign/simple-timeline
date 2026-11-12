# Pure driver decisions only; compiles declarations but never invokes Windows APIs.
$ErrorActionPreference='Stop'
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'windows-installer-ui.ps1'))
$block=[regex]::Match($source,"(?s)Add-Type -TypeDefinition @'\r?\n(.*?)\r?\n'@")
Add-Type -TypeDefinition $block.Groups[1].Value
$failures=[Collections.Generic.List[string]]::new()
function Check([bool]$condition,[string]$name){if($condition){"PASS $name"}else{$failures.Add($name)}}
$pages=[PlanrailPageAdvance]::new()
Check (-not $pages.Observe('page:directory','Next|directory controls',$true)) 'first visible page snapshot does not advance'
Check ($pages.Observe('page:directory','Next|directory controls',$true)) 'second identical snapshot advances once'
$pages.Consume('page:directory')
Check (-not $pages.Observe('page:directory','Next|directory controls',$true)) 'same page never retries'
Check (-not $pages.Observe('page:directory','Install|title trimmed',$true)) 'caption/header changes do not rearm consumed page'
Check (-not $pages.Observe('page:startup','Install|controls still forming',$true)) 'new actual inner page starts stability observation'
Check (-not $pages.Observe('page:startup','Install|startup checkbox visible',$true)) 'changing control tree is not stable'
Check ($pages.Observe('page:startup','Install|startup checkbox visible',$true)) 'stable actual startup page may advance'
$pages.Consume('page:startup')
Check (-not $pages.Observe('page:startup','Install|startup checkbox visible',$true)) 'startup page advances only once'
Check (-not $pages.Observe('modal:guard','OK id2',$true)) 'owned modal waits for stable snapshot'
Check ($pages.Observe('modal:guard','OK id2',$true)) 'stable owned modal may acknowledge'
$pages.Consume('modal:guard')
Check (-not $pages.Observe('modal:guard','OK id2',$true)) 'modal acknowledgement never queues duplicates'
Check ([PlanrailPageAdvance]::Acknowledgement($true,$true,$true,$true,$true,'OK')) 'modal native OK is eligible regardless of id2'
Check ([PlanrailPageAdvance]::Acknowledgement($true,$true,$true,$true,$true,'확인')) 'modal Korean OK is eligible'
Check (-not [PlanrailPageAdvance]::Acknowledgement($false,$true,$true,$true,$true,'OK')) 'main window id2 cannot use modal acknowledgement path'
Check (-not [PlanrailPageAdvance]::Acknowledgement($true,$true,$true,$true,$true,'취소')) 'Cancel is never acknowledgement'
Check (-not [PlanrailPageAdvance]::Acknowledgement($true,$true,$true,$true,$false,'OK')) 'disabled OK is never acknowledged'
Check (-not [PlanrailPageAdvance]::Acknowledgement($true,$false,$true,$true,$true,'OK')) 'only direct modal child is eligible'
if($failures.Count){$failures.ToArray()|ForEach-Object {[Console]::Error.WriteLine("FAIL $_")};exit 1}
