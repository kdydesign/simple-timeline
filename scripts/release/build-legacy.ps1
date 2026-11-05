# The actual 0.2.1 source, not the current application with a lowered version.
$ErrorActionPreference = 'Stop'
$legacySha = '5c41982ee23e1f0f76f1aa0875c5361bd94a865b'
$root = (Get-Location).Path
$legacy = Join-Path $env:RUNNER_TEMP 'simple-timeline-legacy-0.2.1'
function Check-Exit { if ($LASTEXITCODE -ne 0) { throw "Legacy build command failed: $LASTEXITCODE" } }
git fetch origin $legacySha
Check-Exit
git worktree add --detach $legacy $legacySha
Check-Exit
try {
  Set-Location $legacy
  if ((Get-Content package.json -Raw | ConvertFrom-Json).version -ne '0.2.1') { throw 'Pinned legacy source must be 0.2.1' }
  npm ci
  Check-Exit
  npm run dist:win
  Check-Exit
  $manifest = Get-Content release/release-manifest.json -Raw | ConvertFrom-Json
  if ($manifest.sourceSha -ne $legacySha -or $manifest.version -ne '0.2.1') { throw 'Legacy artifact provenance mismatch' }
  $destination = Join-Path $root 'artifacts/windows-legacy'
  New-Item -ItemType Directory -Path $destination -Force | Out-Null
  Copy-Item release/* -Destination $destination -Recurse
} finally {
  Set-Location $root
  git worktree remove --force $legacy
  Check-Exit
}
