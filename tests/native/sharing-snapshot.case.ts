import assert from 'node:assert/strict'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { migrations } from '../../src/main/db/migrations'
import { createRepository, openDatabase } from '../../src/main/db/repository'
import { createSharingStore } from '../../src/main/db/sharing/store'
import { createSharingService } from '../../src/main/sharing/service'
import type { NativeCase, NativeContext } from './helpers'

function fixture(ctx: NativeContext) {
  const queries: string[] = []
  const file = join(ctx.tempDir, 'timeline.sqlite3')
  const db = new Database(file, { verbose: sql => queries.push(String(sql)) })
  ctx.defer(() => db.close())
  db.defaultSafeIntegers(true)
  db.pragma('foreign_keys=ON')
  migrations.forEach(m => m.up(db))
  const local = createRepository(db)
  const store = createSharingStore(db)
  const service = createSharingService({
    storage: {state: 'ready', db, repository: local},
    profile: ctx.tempDir,
    changed: () => {},
  })
  const p = local.createProject({name: 'Local', participants: ['A'], color: '#123ABC'})
  const s = local.createSchedule({projectId: p.id, name: 'Initial', startDate: '2026-11-20', endDate: '2026-11-20'})
  return {db, file, service, store, repo: service.repository, queries, p, s}
}

export const cases: NativeCase[] = [
  {
    name: 'repeated timeline reads skip schedule queries and return independently editable DTOs',
    async run(ctx) {
      const {service, repo, queries} = fixture(ctx)
      try {
        const first = repo.getSnapshot()
        first.projects[0].participants.pop()
        first.schedules[0].reminder.start = true
        first.schedules.pop()
        queries.length = 0
        const second = repo.getSnapshot()
        assert.deepEqual(second.projects[0].participants, ['A'])
        assert.equal(second.schedules[0].reminder.start, false)
        assert.ok(!queries.some(sql => /FROM schedules\b/i.test(sql)), 'unchanged read scanned schedules')
      } finally { await service.dispose() }
    },
  },
  {
    name: 'timeline reads observe other connections and never retain a savepoint that rolls back',
    async run(ctx) {
      const {db, file, service, repo} = fixture(ctx)
      try {
        const read = () => repo.getSnapshot().schedules[0].name
        assert.equal(read(), 'Initial')
        const second = openDatabase(file, true)
        try { second.prepare("UPDATE schedules SET name='External'").run() }
        finally { second.close() }
        assert.equal(read(), 'External')
        assert.throws(db.transaction(() => {
          db.prepare("UPDATE schedules SET name='Temporary'").run()
          assert.equal(read(), 'Temporary')
          db.exec('SAVEPOINT inner_write')
          db.prepare("UPDATE schedules SET name='Discarded'").run()
          assert.equal(read(), 'Discarded')
          db.exec('ROLLBACK TO inner_write')
          assert.equal(read(), 'Temporary')
          throw Error('abort')
        }), /abort/)
        assert.equal(read(), 'External')
        db.exec('DROP TABLE schedules')
        assert.throws(read)
      } finally { await service.dispose() }
    },
  },
  {
    name: 'editing one schedule or project checks permission without reading the timeline',
    async run(ctx) {
      const {repo, service, queries, p, s} = fixture(ctx)
      try {
        queries.length = 0
        assert.equal(repo.updateSchedule({...s, name: 'Edited'}).name, 'Edited')
        assert.equal(repo.updateProject({...p, name: 'Renamed'}).name, 'Renamed')
        assert.ok(!queries.some(sql => /SELECT \* FROM schedules\b.*ORDER BY project_id/is.test(sql)),
          'edit loaded a full schedule list')
      } finally { await service.dispose() }
    },
  },
  {
    name: 'cached reads reflect host role transitions and member revocation with local data intact',
    async run(ctx) {
      const {service, store, repo, p} = fixture(ctx)
      try {
        assert.deepEqual(repo.getSnapshot().projects.map(x => x.name), ['Local'])
        store.configureHost({address: '127.0.0.1', port: 47831})
        const host = store.saveProject({name: 'Host', participants: [], color: '#123ABC'})
        const schedule = repo.createSchedule({projectId: host.id, name: 'Host schedule', startDate: '2026-11-20', endDate: '2026-11-20'})
        assert.equal(repo.getSnapshot().projects[1].sharing, 'host')
        store.beginRoleTransition({role: 'member', confirmed: true})
        assert.deepEqual(repo.getSnapshot().projects.map(x => x.id), [p.id])
        store.prepareRoleCleanup()
        store.completeRoleTransition()
        assert.throws(() => repo.updateSchedule({...schedule, name: 'Dormant'}), {code: 'FORBIDDEN'})
        assert.throws(() => repo.deleteSchedule({id: schedule.id}), {code: 'FORBIDDEN'})
        assert.throws(() => repo.updateScheduleReminder({id: schedule.id, reminder: schedule.reminder}), {code: 'FORBIDDEN'})
        const hostId = '11111111-1111-4111-8111-111111111111', datasetId = '22222222-2222-4222-8222-222222222222'
        store.connectMember({hostId, datasetId, address: '127.0.0.2', port: 47831, certificatePin: 'test', credentialRef: 'protected'})
        store.applyCache({hostId, datasetId, protocolVersion: 1, schedules: [], projects: [
          {id: '10', name: 'Remote 10', participants: [], color: '#123ABC', createdAt: 't', updatedAt: 't'},
          {id: '2', name: 'Remote 2', participants: [], color: '#123ABC', createdAt: 't', updatedAt: 't'},
        ]})
        assert.deepEqual(repo.getSnapshot().projects.map(x => x.name), ['Local', 'Remote 2', 'Remote 10'])
        store.clearCache()
        assert.deepEqual(repo.getSnapshot().projects.map(x => x.name), ['Local'])
      } finally { await service.dispose() }
    },
  },
]
