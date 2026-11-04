import Database from 'better-sqlite3'
import { createSchema } from '../../src/main/db/schema'
import assert from 'node:assert/strict'
import { setup, type NativeCase } from './helpers'
import { createRepository, openDatabase } from '../../src/main/db/repository'
export const cases: NativeCase[] = [
  {
    name: 'reads a snapshot with bounded queries while preserving participant order and empty projects',
    run(ctx) {
      const queries: string[] = []
      const db = new Database(':memory:', { verbose: (sql) => queries.push(String(sql)) })
      ctx.defer(() => db.close())
      db.defaultSafeIntegers(true)
      createSchema(db)
      const repo = createRepository(db)
      for (let i = 0; i < 200; i++)
        repo.createProject({ name: `P${i}`, color: '#2563EB', participants: i % 2 ? [] : ['Z', 'A'] })
      queries.length = 0
      const snapshot = repo.getSnapshot()
      assert.equal(snapshot.projects.length, 200)
      assert.deepEqual(snapshot.projects[0].participants, ['Z', 'A'])
      assert.deepEqual(snapshot.projects[1].participants, [])
      assert.deepEqual(snapshot.schedules, [])
      const reads = queries.filter((sql) => /^SELECT/i.test(sql))
      assert.ok(reads.length <= 3, `snapshot issued ${reads.length} SELECTs for 200 projects`)
      repo.updateProject({ ...snapshot.projects[0], participants: ['B'] })
      assert.deepEqual(repo.getSnapshot().projects[0].participants, ['B'])
    },
  },
  {
    name: 'normalizes participants, allows duplicate names and preserves numeric ID order',
    run(ctx) {
      const { db, repo } = setup(ctx)
      const a = repo.createProject({
        name: ' QA ',
        color: '#ab12ef',
        participants: [' 민수 ', '', '민수', 'Jin', 'jin'],
      })
      assert.equal(a.name, 'QA')
      assert.equal(a.color, '#AB12EF')
      assert.deepEqual(a.participants, ['민수', 'Jin', 'jin'])
      const b = repo.createProject({
        name: 'QA',
        color: '#2563EB',
        participants: [],
      })
      assert.notEqual(a.id, b.id)
      db.prepare("UPDATE sqlite_sequence SET seq=? WHERE name='projects'").run(
        9007199254740992n,
      )
      assert.equal(
        repo.createProject({ name: 'big', color: '#2563EB', participants: [] })
          .id,
        '9007199254740993',
      )
      const saved = repo.updateProject({
        ...a,
        name: 'new',
        participants: ['지수', '민수'],
      })
      assert.equal(saved.createdAt, a.createdAt)
      assert.deepEqual(saved.participants, ['지수', '민수'])
      assert.deepEqual(
        repo.getSnapshot().projects.map((p) => p.id),
        ['1', '2', '9007199254740993'],
      )
    },
  },
  {
    name: 'rejects orphan schedules and invalid business dates in the database',
    run(ctx) {
      const { db, repo } = setup(ctx)
      const p = repo.createProject({
        name: 'P',
        color: '#2563EB',
        participants: [],
      })
      const insert = db.prepare(
        "INSERT INTO schedules(project_id,name,start_date,end_date,created_at,updated_at) VALUES(?, 'QA', ?, ?, 't', 't')",
      )
      for (const d of [
        '1900-02-29',
        '0000-01-01',
        '2026-2-01',
        '2026-04-31',
        '2026-11-01T00:00:00Z',
      ])
        assert.throws(() => insert.run(BigInt(p.id), d, d))
      assert.throws(() => insert.run(999n, '2026-12-18', '2026-12-18'))
      assert.throws(() => insert.run(BigInt(p.id), '2026-12-19', '2026-12-18'))
      insert.run(BigInt(p.id), '0001-01-01', '9999-12-31')
      insert.run(BigInt(p.id), '2000-02-29', '2000-02-29')
      assert.equal(repo.getSnapshot().schedules.length, 2)
    },
  },
  {
    name: 'rolls back parent, participant and child deletes on a mid-cascade failure',
    run(ctx) {
      const { db, repo } = setup(ctx)
      const p = repo.createProject({
        name: 'P',
        color: '#2563EB',
        participants: ['A'],
      })
      repo.createSchedule({
        projectId: p.id,
        name: 'QA',
        startDate: '2026-12-18',
        endDate: '2026-12-18',
      })
      db.exec(
        "CREATE TRIGGER fail_delete BEFORE DELETE ON schedules BEGIN SELECT RAISE(ABORT,'test failure'); END",
      )
      assert.throws(() => repo.deleteProject({ id: p.id, confirmed: true }))
      assert.equal(repo.getSnapshot().projects.length, 1)
      assert.equal(repo.getSnapshot().schedules.length, 1)
      assert.deepEqual(repo.getSnapshot().projects[0].participants, ['A'])
      db.exec('DROP TRIGGER fail_delete')
      repo.deleteProject({ id: p.id, confirmed: true })
      assert.deepEqual(repo.getSnapshot(), { projects: [], schedules: [] })
      assert.equal(
        (
          db
            .prepare('SELECT count(*) AS n FROM project_participants')
            .get() as { n: bigint }
        ).n,
        0n,
      )
    },
  },
  {
    name: 'persists and sorts schedules, checks NOT_FOUND and required connection pragmas',
    run(ctx) {
      const { db, repo, file } = setup(ctx)
      const p = repo.createProject({
        name: 'P',
        color: '#2563EB',
        participants: [],
      })
      const long = repo.createSchedule({
        projectId: p.id,
        name: 'same',
        startDate: '2026-11-10',
        endDate: '2026-11-20',
      })
      const short = repo.createSchedule({
        projectId: p.id,
        name: 'same',
        startDate: '2026-11-10',
        endDate: '2026-11-15',
      })
      assert.deepEqual(
        repo.getSnapshot().schedules.map((s) => s.id),
        [short.id, long.id],
      )
      assert.throws(
        () =>
          repo.updateSchedule({
            id: '999',
            name: 'x',
            startDate: '2026-11-01',
            endDate: '2026-11-01',
          }),
        { code: 'NOT_FOUND' },
      )
      repo.updateSchedule({ ...short, name: 'fixed' })
      repo.deleteSchedule({ id: long.id })
      assert.equal(db.pragma('foreign_keys', { simple: true }), 1n)
      assert.equal(db.pragma('synchronous', { simple: true }), 2n)
      assert.equal(db.pragma('journal_mode', { simple: true }), 'delete')
      assert.equal(db.pragma('busy_timeout', { simple: true }), 3000n)
      db.close()
      const reopened = openDatabase(file)
      ctx.defer(() => reopened.close())
      assert.equal(
        createRepository(reopened).getSnapshot().schedules[0].name,
        'fixed',
      )
    },
  },
]
