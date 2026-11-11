import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import yauzl from 'yauzl'
import { createUpdateBundle } from '../../scripts/release/update-bundle.mjs'
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'planrail-release-bundle-')); t.after(() => rm(directory, { recursive: true, force: true }))
  const installer = 'Planrail-0.8.0.exe', bytes = Buffer.from('MZ installer fixture'), sha512 = createHash('sha512').update(bytes).digest('base64')
  await writeFile(join(directory, installer), bytes); await writeFile(join(directory, installer + '.blockmap'), 'blockmap')
  await writeFile(join(directory, 'latest.yml'), `version: 0.8.0\nfiles:\n  - url: ${installer}\n    sha512: ${sha512}\n    size: ${bytes.length}\npath: ${installer}\nsha512: ${sha512}\nreleaseDate: '2026-11-11T00:00:00.000Z'\n`)
  return { directory, manifest: { version: '0.8.0', arch: 'x64', target: 'Windows 11', sourceSha: 'a'.repeat(40), installer, signed: false, validationUpdateOnly: false, distribution: 'private-ci-artifact' } }
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
 const section=workflow.split('name: Planrail-LAN-UPDATE-')[1]?.split('      - uses:')[0]
 assert.ok(section,'Dedicated LAN artifact missing')
 for(const file of ['release/*.exe','release/*.exe.blockmap','release/latest.yml','release/release-manifest.json','release/*.exe.sha256','release/USER-GUIDE.ko.md'])assert.ok(section.includes(file),file)
 assert.ok(!section.includes('.zip'),'GitHub artifact ZIP must itself be the import bundle')
 assert.ok(!section.includes('release/*.sha256'),'Do not include nested bundle checksums')
})
