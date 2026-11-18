import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { MSI_INSPECTION_FUNCTIONS } from '../../src/main/node-management/standalone-windows'

// Windows Installer COM is unavailable on Linux. Never query or modify installed products:
// a fresh database reproduces COM void-return pollution without installing anything.
it.skipIf(process.platform !== 'win32')('reads one scalar MSI value and closes its view even when a field is missing', () => {
  const directory = mkdtempSync(join(tmpdir(), 'workrail-msi-read-'))
  const path = join(directory, 'fixture.msi').replaceAll("'", "''")
  const script = MSI_INSPECTION_FUNCTIONS + `
$installer = New-Object -ComObject WindowsInstaller.Installer
$db = $installer.OpenDatabase('${path}', 3)
$view = $db.OpenView('CREATE TABLE Property (Property CHAR(72) NOT NULL, Value CHAR(0) LOCALIZABLE PRIMARY KEY Property)')
[void]$view.Execute()
[void]$view.Close()
$view = $db.OpenView("INSERT INTO Property (Property, Value) VALUES ('Manufacturer', 'Node.js Foundation')")
[void]$view.Execute()
[void]$view.Close()
$values = @(Read-MsiValue $db "SELECT Value FROM Property WHERE Property='Manufacturer'")
$missing = $false
try { $null = Read-MsiValue $db "SELECT Value FROM Property WHERE Property='Missing'" } catch { $missing = $true }
$again = @(Read-MsiValue $db "SELECT Value FROM Property WHERE Property='Manufacturer'")
[Console]::WriteLine((@{ values=$values; missing=$missing; again=$again } | ConvertTo-Json -Compress))
`
  try {
    const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { encoding: 'utf8', timeout: 15_000, windowsHide: true })
    expect(JSON.parse(output.trim())).toEqual({ values: ['Node.js Foundation'], missing: true, again: ['Node.js Foundation'] })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}, 20_000)
