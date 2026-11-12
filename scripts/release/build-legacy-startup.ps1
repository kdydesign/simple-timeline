# Actual approved 0.8.0 source. Never synthesize it by lowering today's version.
$ErrorActionPreference='Stop'
$legacySha='bde6edf63b8f16f6be4943f864aca2e585339245'
$root=(Get-Location).Path
$legacy=Join-Path $env:RUNNER_TEMP 'planrail-legacy-0.8.0'
function Check-Exit {if($LASTEXITCODE -ne 0){throw "Legacy 0.8.0 build command failed: $LASTEXITCODE"}}
git fetch origin $legacySha
Check-Exit
git worktree add --detach $legacy $legacySha
Check-Exit
try {
  Set-Location $legacy
  if((Get-Content package.json -Raw|ConvertFrom-Json).version -ne '0.8.0'){throw 'Pinned source version mismatch'}
  npm ci
  Check-Exit
  npm run dist:win
  Check-Exit
  $manifest=Get-Content release/release-manifest.json -Raw|ConvertFrom-Json
  if($manifest.sourceSha -ne $legacySha -or $manifest.version -ne '0.8.0'){throw 'Legacy 0.8.0 provenance mismatch'}
  $destination=Join-Path $root 'artifacts/windows-legacy-startup'
  New-Item -ItemType Directory -Path $destination -Force|Out-Null
  Copy-Item release/* -Destination $destination -Recurse
} finally {
  Set-Location $root
  git worktree remove --force $legacy
  Check-Exit
}
