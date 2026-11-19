# Only the disposable Windows CI runner is allowed to exercise actual nvm links.
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows') { throw 'Disposable Windows runner required' }
$directory = Join-Path $env:RUNNER_TEMP ('workrail-nvm-' + [Guid]::NewGuid())
$digests = @{
  '1.1.10' = '79974e8d60916910ffee604434668909a40f66b413d6cbee6bd88f9e868238ab'
  '1.1.11' = '12e9c418a6b0d9d06736b7ccbf67225fe081f64e81f9ab831bc399b4255d8aad'
}
try {
  New-Item -ItemType Directory -Path $directory | Out-Null
  foreach ($version in $digests.Keys) {
    $zip = Join-Path $directory "$version.zip"
    Invoke-WebRequest "https://github.com/nvm-windows/nvm/releases/download/$version/nvm-noinstall.zip" -OutFile $zip
    if ((Get-FileHash $zip -Algorithm SHA256).Hash -ne $digests[$version]) { throw "Unexpected nvm $version archive" }
    Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $directory $version)
  }
  $env:WORKRAIL_TEST_NVM_DIRECTORY = $directory
  & node node_modules/vitest/vitest.mjs run --config vitest.config.mts tests/unit/node-zip-windows.test.ts
  if ($LASTEXITCODE -ne 0) { throw 'Classic nvm ZIP acceptance failed' }
} finally {
  Remove-Item Env:WORKRAIL_TEST_NVM_DIRECTORY -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $directory) { Remove-Item -LiteralPath $directory -Recurse -Force }
}
