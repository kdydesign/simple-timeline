import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import { promises as physicalFs } from 'original-fs'
import { prepareMaintenance, verifyMaintenance } from '../../src/main/node-maintenance/runtime'
import type { NativeCase } from './helpers'

export const cases: NativeCase[] = [{
  name: 'copies the Electron default app archive byte for byte and verifies it from the independent runtime',
  async run({ tempDir }) {
    const runtimeDirectory = join(tempDir, 'dist')
    const resources = join(runtimeDirectory, 'resources')
    await physicalFs.mkdir(resources, { recursive: true })
    await physicalFs.writeFile(join(runtimeDirectory, 'electron.exe'), 'fixture')
    const archive = join(process.resourcesPath, 'default_app.asar')
    await physicalFs.copyFile(archive, join(resources, 'default_app.asar'))

    const staged = await prepareMaintenance({
      runtimeDirectory, buildDirectory: resolve('out'),
      maintenanceRoot: join(tempDir, 'recovery'), version: '1.0.0',
    })
    const copy = join(staged.directory, 'runtime', 'resources', 'default_app.asar')
    assert.deepEqual(await physicalFs.readFile(copy), await physicalFs.readFile(archive))
    assert.equal(await verifyMaintenance(staged.directory), staged.artifactId)
    await physicalFs.appendFile(copy, 'changed')
    await assert.rejects(verifyMaintenance(staged.directory), /integrity/i)
  },
}]
