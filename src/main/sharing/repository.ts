import type { DatabaseHandle, Repository } from '../db/repository'
import type { SharingStore } from '../db/sharing/store'
import type { TimelineSnapshot } from '../../shared/types'
import { failure } from '../errors'

function copySnapshot(snapshot: TimelineSnapshot): TimelineSnapshot {
  return {
    projects: snapshot.projects.map(p => ({ ...p, participants: [...p.participants] })),
    schedules: snapshot.schedules.map(s => ({ ...s, reminder: { ...s.reminder } })),
  }
}

export function createSharingRepository(db: DatabaseHandle, local: Repository, store: SharingStore): Repository {
  const sharedIds = db.prepare('SELECT project_id FROM sharing_projects').pluck()
  const sharedProject = db.prepare('SELECT 1 FROM sharing_projects WHERE project_id=?')
  const sharedSchedule = db.prepare(`
    SELECT 1 FROM schedules s JOIN sharing_projects sp ON sp.project_id=s.project_id WHERE s.id=?
  `)
  const participantNames = db.prepare(`
    SELECT pp.name FROM projects p LEFT JOIN project_participants pp ON pp.project_id=p.id
    WHERE p.id=? ORDER BY pp.position
  `).pluck()

  function readSnapshot(): TimelineSnapshot {
    const source = local.getSnapshot()
    const shared = new Set((sharedIds.all() as bigint[]).map(String))
    if (shared.size) {
      for (const p of source.projects) if (shared.has(p.id)) p.sharing = 'host'
      for (const s of source.schedules) if (shared.has(s.projectId)) s.sharing = 'host'
    }
    if (store.getConfig().role === 'member' && !store.getRoleTransition()) {
      // Each reader already sorts by project, dates and ID. Numeric local IDs precede shared IDs.
      const member = store.readCache()
      return { projects: source.projects.concat(member.projects), schedules: source.schedules.concat(member.schedules) }
    }
    return source
  }

  // Own-connection DML, commits by other connections, and local DDL have distinct SQLite counters.
  const revision = db.prepare(`
    SELECT printf('%lld/%lld/%lld', total_changes(), data_version, schema_version)
    FROM pragma_data_version, pragma_schema_version
  `).pluck()
  let cached: { version: string; snapshot: TimelineSnapshot } | undefined
  const readCommitted = db.transaction(() => {
    const version = revision.get() as string
    if (cached?.version === version) return cached
    return { version, snapshot: readSnapshot() }
  })
  function getSnapshot(): TimelineSnapshot {
    // A savepoint can roll back without changing total_changes(). Never publish a nested read.
    if (db.inTransaction) return readSnapshot()
    cached = readCommitted()
    return copySnapshot(cached.snapshot)
  }

  const idle = () => {
    if (store.getRoleTransition()) throw failure('FORBIDDEN')
  }
  const projectWritable = (id: string) => {
    idle()
    if (store.getConfig().role !== 'host' && sharedProject.get(id)) throw failure('FORBIDDEN')
  }
  const scheduleWritable = (id: string) => {
    idle()
    if (store.getConfig().role !== 'host' && sharedSchedule.get(id)) throw failure('FORBIDDEN')
  }
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((name, i) => name === b[i])
  return {
    ...local,
    getSnapshot,
    deleteProject: db.transaction((input: Parameters<Repository['deleteProject']>[0]) => {
      projectWritable(input.id)
      return local.deleteProject(input)
    }),
    createSchedule: db.transaction((input: Parameters<Repository['createSchedule']>[0]) => {
      projectWritable(input.projectId)
      return local.createSchedule(input)
    }),
    updateSchedule: db.transaction((input: Parameters<Repository['updateSchedule']>[0]) => {
      scheduleWritable(input.id)
      return local.updateSchedule(input)
    }),
    updateScheduleReminder: db.transaction((input: Parameters<Repository['updateScheduleReminder']>[0]) => {
      scheduleWritable(input.id)
      return local.updateScheduleReminder(input)
    }),
    deleteSchedule: db.transaction((input: Parameters<Repository['deleteSchedule']>[0]) => {
      scheduleWritable(input.id)
      return local.deleteSchedule(input)
    }),
    createProject: db.transaction((input: Parameters<Repository['createProject']>[0]) => {
      idle()
      if (store.getConfig().role !== 'host' && input.participants.length) throw failure('FORBIDDEN')
      return local.createProject(input)
    }),
    updateProject: db.transaction((input: Parameters<Repository['updateProject']>[0]) => {
      projectWritable(input.id)
      if (store.getConfig().role !== 'host') {
        const rows = participantNames.all(input.id) as (string | null)[]
        if (rows.length && !same(input.participants, rows.filter(name => name !== null))) throw failure('FORBIDDEN')
      }
      const mapping = store.listSharedProjects().find(p => p.id === input.id)
      if (mapping) {
        if (!same(input.participants, mapping.participants.map(p => p.name))) throw failure('FORBIDDEN')
        return store.saveProject({ ...input, participants: mapping.participants })
      }
      return local.updateProject(input)
    }),
  }
}
