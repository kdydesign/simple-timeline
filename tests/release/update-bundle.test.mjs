import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm, readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import yauzl from 'yauzl'
import { load } from 'js-yaml'
import { createUpdateBundle } from '../../scripts/release/update-bundle.mjs'
async function fixture(t, { installer = 'Planrail-0.8.0.exe', version = '0.8.0' } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'planrail-release-bundle-')); t.after(() => rm(directory, { recursive: true, force: true }))
  const bytes = Buffer.from('MZ installer fixture'), sha512 = createHash('sha512').update(bytes).digest('base64')
  await writeFile(join(directory, installer), bytes); await writeFile(join(directory, installer + '.blockmap'), 'blockmap')
  await writeFile(join(directory, 'latest.yml'), `version: ${version}\nfiles:\n  - url: ${installer}\n    sha512: ${sha512}\n    size: ${bytes.length}\npath: ${installer}\nsha512: ${sha512}\nreleaseDate: '2026-11-11T00:00:00.000Z'\n`)
  return { directory, manifest: { version, arch: 'x64', target: 'Windows 11', sourceSha: 'a'.repeat(40), installer, signed: false, validationUpdateOnly: false, distribution: 'private-ci-artifact' } }
}
async function unzip(path) {
  const zip = await new Promise((resolve, reject) => yauzl.open(path, { lazyEntries: true }, (e, z) => e ? reject(e) : resolve(z))), result = new Map()
  await new Promise((resolve, reject) => { zip.on('error', reject); zip.on('end', resolve); zip.on('entry', entry => zip.openReadStream(entry, (error, stream) => { if(error) return reject(error); const chunks = []; stream.on('error', reject); stream.on('data', c => chunks.push(c)); stream.on('end', () => { result.set(entry.fileName, Buffer.concat(chunks)); zip.readEntry() }) })); zip.readEntry() }); return result
}
test('creates a self-contained production ZIP with every file hash and legacy manifest fields', async t => {
  const input = await fixture(t); await writeFile(join(input.directory, 'USER-GUIDE.ko.md'), 'usage')
  const { zipPath, manifest } = await createUpdateBundle(input), files = await unzip(zipPath)
  assert.deepEqual([...files.keys()].sort(), ['Planrail-0.8.0.exe', 'Planrail-0.8.0.exe.blockmap', 'Planrail-0.8.0.exe.sha256', 'USER-GUIDE.ko.md', 'latest.yml', 'release-manifest.json'].sort())
  assert.equal(manifest.appId, 'com.kdydesign.simpletimeline'); assert.equal(manifest.installScope, 'per-user'); assert.equal(manifest.installer, 'Planrail-0.8.0.exe'); assert.equal(manifest.files.length, 4)
  for (const file of manifest.files) { assert.equal(file.size, files.get(file.name).length); assert.equal(file.sha256, createHash('sha256').update(files.get(file.name)).digest('hex')); assert.equal(file.sha512, createHash('sha512').update(files.get(file.name)).digest('base64')) }
  const checksum = files.get('Planrail-0.8.0.exe.sha256').toString(); assert.match(checksum, /  release-manifest.json\n/)
  assert.deepEqual(JSON.parse(files.get('release-manifest.json')), manifest)
})
test('references the WorkRail installer and its exact hashes throughout the production ZIP', async t => {
  const stem = `WorkRail-1.0.0-win-x64-${'a'.repeat(40)}`
  const installer = `${stem}.exe`, blockmap = `${installer}.blockmap`, checksumName = `${installer}.sha256`
  const input = await fixture(t, { installer, version: '1.0.0' })
  const { zipPath } = await createUpdateBundle(input)
  const zipName = `${stem}-update.zip`
  assert.equal(basename(zipPath), zipName)
  assert.equal(await readFile(`${zipPath}.sha256`, 'utf8'), `${createHash('sha256').update(await readFile(zipPath)).digest('hex')}  ${zipName}\n`)

  const files = await unzip(zipPath)
  const payloadNames = [installer, blockmap, 'latest.yml']
  assert.deepEqual([...files.keys()].sort(), [...payloadNames, 'release-manifest.json', checksumName].sort())
  const manifest = JSON.parse(files.get('release-manifest.json'))
  const metadata = load(files.get('latest.yml').toString())
  const installerSha512 = createHash('sha512').update(files.get(installer)).digest('base64')
  assert.equal(metadata.path, installer)
  assert.equal(metadata.sha512, installerSha512)
  assert.deepEqual(metadata.files, [{ url: installer, sha512: installerSha512, size: files.get(installer).length }])
  assert.equal(manifest.installer, installer)
  assert.equal(manifest.appId, 'com.kdydesign.simpletimeline')
  assert.equal(manifest.sha256, createHash('sha256').update(files.get(installer)).digest('hex'))
  assert.deepEqual(manifest.files, payloadNames.map((name, i) => ({
    id: ['installer', 'blockmap', 'metadata'][i],
    name,
    size: files.get(name).length,
    sha256: createHash('sha256').update(files.get(name)).digest('hex'),
    sha512: createHash('sha512').update(files.get(name)).digest('base64'),
  })))
  assert.equal(files.get(checksumName).toString(), [...payloadNames, 'release-manifest.json']
    .map(name => `${createHash('sha256').update(files.get(name)).digest('hex')}  ${name}\n`).join(''))
})
test('rejects synthetic fixtures and metadata mismatches without creating an update ZIP', async t => {
  const input = await fixture(t)
  await assert.rejects(createUpdateBundle({ ...input, manifest: { ...input.manifest, validationUpdateOnly: true } }), /fixture|validation/i)
  await writeFile(join(input.directory, 'latest.yml'), 'version: 99.0.0\npath: https://attacker/evil.exe')
  await assert.rejects(createUpdateBundle(input), /metadata/i)
  assert.equal((await readdir(input.directory)).filter(n => n.endsWith('.zip')).length, 0)
})
test('rejects incomplete release input', async t => {
  const input = await fixture(t); await rm(join(input.directory, input.manifest.installer + '.blockmap'))
  await assert.rejects(createUpdateBundle(input)); assert.equal((await readdir(input.directory)).filter(n => n.endsWith('.zip')).length, 0)
})
test('rejects a numeric releaseDate before producing a ZIP the importer would reject', async t => {
  const input = await fixture(t), metadataPath = join(input.directory, 'latest.yml')
  const metadata = await readFile(metadataPath, 'utf8')
  await writeFile(metadataPath, metadata.replace(/releaseDate:.*\n/, 'releaseDate: 123\n'))
  await assert.rejects(createUpdateBundle(input), /metadata/i)
  assert.equal((await readdir(input.directory)).filter(name => name.endsWith('.zip')).length, 0)
})
test('Actions offers a flat directly importable LAN update artifact, without a nested ZIP', async () => {
 const workflow=await readFile('.github/workflows/app.yml','utf8')
 const section=load(workflow).jobs.app.steps.find(step=>step.uses==='actions/upload-artifact@v4'&&step.with.name.startsWith('WorkRail-LAN-UPDATE-'))?.with.path
 assert.ok(section,'Dedicated LAN artifact missing')
 assert.deepEqual(section.trim().split('\n').sort(), [
   'release/*.exe', 'release/*.exe.blockmap', 'release/*.exe.sha256',
   'release/USER-GUIDE.ko.md', 'release/latest.yml', 'release/release-manifest.json',
 ].sort())
})
