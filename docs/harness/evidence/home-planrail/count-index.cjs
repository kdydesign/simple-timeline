// Build two diagnostic copies and count calls by snapshot identity in a real renderer.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { createRequire } = require('node:module')
const { execFileSync } = require('node:child_process')
const [before, after, output, size = "3"] = process.argv.slice(2)
const count = Number(size)
if (!output || ![3, 10000].includes(count)) throw Error('Usage: node count-index.cjs BEFORE AFTER NEW_OUTPUT.json [3|10000]')

async function diagnose(root, copy) {
  const dep = createRequire(path.resolve(root, 'package.json'))
  const { _electron } = dep('playwright')
  await fs.mkdir(copy)
  for (const name of ['src', 'tests', 'resources', 'package.json', 'scripts',
    'electron.vite.config.mts', 'electron.vite.test.config.mts']) {
    await fs.cp(path.join(root, name), path.join(copy, name), {recursive:true})
  }
  await fs.symlink(path.resolve(root, 'node_modules'), path.join(copy, 'node_modules'), 'dir')
  const file = path.join(copy, 'src/visualization/presentation.ts')
  const source = await fs.readFile(file, 'utf8')
  const entry = /export function indexSnapshot\(snapshot: TimelineSnapshot\)(?:: SnapshotIndex)? \{/
  assert.match(source, entry)
  const diagnostic = `
    const indexStartedAt = performance.now()
    const diagnostics = ((window as any).indexDiagnostics ??= {ids: new WeakMap(), calls: []})
    let id = diagnostics.ids.get(snapshot)
    if (id === undefined) {
      id = diagnostics.calls.length
      diagnostics.ids.set(snapshot, id)
      diagnostics.calls.push({snapshot: id, schedules: snapshot.schedules.length, count: 0, durationsMs: []})
    }
    diagnostics.calls[id].count++
  `
  const body = source.replace(entry, match => match + diagnostic)
  const returnIndex = '  return {\n    projects,'
  assert.ok(body.includes(returnIndex))
  await fs.writeFile(file, body.replace(returnIndex,
    '  diagnostics.calls[id].durationsMs.push(performance.now() - indexStartedAt)\n' + returnIndex))
  execFileSync('npm', ['run', 'build:test'], {cwd:copy, stdio:'pipe'})
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'simple-timeline-index-count-'))
  async function launch(seed) {
    return _electron.launch({executablePath:dep('electron'),chromiumSandbox:true,
      args:[path.join(copy,'artifacts/test-app/main/index.cjs')],
      env:{...process.env,TZ:'UTC',SIMPLE_TIMELINE_TEST_PROFILE:profile,
        SIMPLE_TIMELINE_TEST_FAULT:'',SIMPLE_TIMELINE_TEST_SEED:seed}})
  }
  let app
  try {
    app = await launch(count === 3 ? 'hotfix' : 'scale')
    let page = await app.firstWindow()
    await page.waitForFunction(async n => (await window.simpleTimeline.getSnapshot()).data?.schedules.length === n, count)
    await app.close()
    app = await launch('')
    page = await app.firstWindow()
    await page.waitForFunction(() => document.documentElement.dataset.timelinePhase === 'ready')
    const calls = () => page.evaluate(() => window.indexDiagnostics.calls)
    const home = await calls()
    const dock = page.getByRole('navigation', {name:'WorkRail 도구'})
    await dock.getByRole('button', {name:'PlanRail',exact:true}).click()
    await page.getByRole('scrollbar', {name:'간트 가로 이동'}).waitFor()
    const first = await calls()
    await dock.getByRole('button', {name:'Home',exact:true}).click()
    await dock.getByRole('button', {name:'PlanRail',exact:true}).click()
    await page.getByRole('scrollbar', {name:'간트 가로 이동'}).waitFor()
    return {home, first, roundTrip:await calls()}
  } finally {
    if (app) await app.close()
    await fs.rm(profile, {recursive:true,force:true})
  }
}

async function main() {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'workrail-index-build-'))
  try {
    const result = {}
    for (const [name, root, expected] of [['before',before,2],['after',after,1]]) {
      result[name] = await diagnose(path.resolve(root), path.join(folder,name))
      for (const stage of Object.values(result[name])) {
        assert.ok(stage.length > 0)
        stage.forEach((input, i) => {
          assert.equal(input.snapshot, i)
          assert.equal(input.schedules, count)
          assert.equal(input.count, expected)
        })
      }
    }
    await fs.writeFile(output, JSON.stringify(result, null, 2) + '\n', {flag:'wx'})
    console.log(JSON.stringify(result))
  } finally {
    await fs.rm(folder, {recursive:true,force:true})
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
