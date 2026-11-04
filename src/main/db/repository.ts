import Database from 'better-sqlite3'
import type { TimelineApi } from '../../shared/api'
import type {
  Project,
  Schedule,
  ProjectInput,
  ScheduleInput,
  ScheduleUpdate,
} from '../../shared/types'
import {
  normalizeName,
  normalizeColor,
  normalizeParticipants,
  validateId,
} from '../../domain/normalize'
import { parseBusinessDate, inclusiveDays } from '../../domain/date'
export type DatabaseHandle = Database.Database
// Synchronous main-only equivalent of the public async API.
type Data<T> = T extends { ok: true; data: infer D } ? D : never
export type Repository = {
  [K in Exclude<keyof TimelineApi, 'getStatus'>]: (
    ...args: Parameters<TimelineApi[K]>
  ) => Data<Awaited<ReturnType<TimelineApi[K]>>>
}
export class RepositoryError extends Error {
  readonly code = 'NOT_FOUND'
  constructor() {
    super('항목을 찾을 수 없습니다.')
  }
}
export function openDatabase(file: string, mustExist = false): DatabaseHandle {
  const db = new Database(file, { fileMustExist: mustExist })
  try {
    db.pragma('foreign_keys=ON')
    db.pragma('journal_mode=DELETE')
    db.pragma('synchronous=FULL')
    db.pragma('busy_timeout=3000')
    db.defaultSafeIntegers(true)
    return db
  } catch (e) {
    db.close()
    throw e
  }
}
type Row = Record<string, string | bigint>
export function createRepository(
  db: DatabaseHandle,
  clock: () => string = () => new Date().toISOString(),
): Repository {
  const participants = (id: string): string[] =>
    (
      db
        .prepare(
          'SELECT name FROM project_participants WHERE project_id=? ORDER BY position',
        )
        .all(BigInt(id)) as Row[]
    ).map((r) => String(r.name))
  const projectDto = (r: Row, names: string[]): Project => ({
    id: String(r.id),
    name: String(r.name),
    color: String(r.color),
    participants: names,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  })
  const scheduleDto = (r: Row): Schedule => ({
    id: String(r.id),
    projectId: String(r.project_id),
    name: String(r.name),
    startDate: String(r.start_date),
    endDate: String(r.end_date),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  })
  const getProject = (id: string): Project => {
    const r = db
      .prepare('SELECT * FROM projects WHERE id=?')
      .get(BigInt(validateId(id))) as Row | undefined
    if (!r) throw new RepositoryError()
    return projectDto(r, participants(String(r.id)))
  }
  const getSchedule = (id: string): Schedule => {
    const r = db
      .prepare('SELECT * FROM schedules WHERE id=?')
      .get(BigInt(validateId(id))) as Row | undefined
    if (!r) throw new RepositoryError()
    return scheduleDto(r)
  }
  const putParticipants = (id: string, names: string[]) => {
    db.prepare('DELETE FROM project_participants WHERE project_id=?').run(
      BigInt(id),
    )
    const q = db.prepare(
      'INSERT INTO project_participants(project_id,position,name) VALUES(?,?,?)',
    )
    names.forEach((name, i) => q.run(BigInt(id), i, name))
  }
  const projectValues = (v: ProjectInput) => ({
    name: normalizeName(v.name),
    color: normalizeColor(v.color),
    participants: normalizeParticipants(v.participants),
  })
  const dates = (v: ScheduleUpdate | ScheduleInput) => {
    const startDate = parseBusinessDate(v.startDate, 'startDate'),
      endDate = parseBusinessDate(v.endDate, 'endDate')
    inclusiveDays(startDate, endDate)
    return { name: normalizeName(v.name), startDate, endDate }
  }
  // Keep all three reads in one transaction; participant queries must not grow with project count.
  const snapshotProjects = db.prepare('SELECT * FROM projects ORDER BY id')
  const snapshotParticipants = db.prepare(
    'SELECT project_id,name FROM project_participants ORDER BY project_id,position',
  )
  const snapshotSchedules = db.prepare(
    'SELECT * FROM schedules ORDER BY project_id,start_date,end_date,id',
  )
  return {
    getSnapshot: db.transaction(() => {
      const names = new Map<string, string[]>()
      for (const row of snapshotParticipants.all() as Row[]) {
        const id = String(row.project_id)
        const list = names.get(id) ?? []
        list.push(String(row.name))
        names.set(id, list)
      }
      return {
        projects: (snapshotProjects.all() as Row[]).map((row) =>
          projectDto(row, names.get(String(row.id)) ?? []),
        ),
        schedules: (snapshotSchedules.all() as Row[]).map(scheduleDto),
      }
    }),
    createProject: db.transaction((input: ProjectInput) => {
      const v = projectValues(input),
        now = clock()
      const info = db
        .prepare(
          'INSERT INTO projects(name,color,created_at,updated_at) VALUES(?,?,?,?)',
        )
        .run(v.name, v.color, now, now)
      const id = String(info.lastInsertRowid)
      putParticipants(id, v.participants)
      return getProject(id)
    }),
    updateProject: db.transaction((input: ProjectInput & { id: string }) => {
      const id = validateId(input.id)
      getProject(id)
      const v = projectValues(input)
      db.prepare(
        'UPDATE projects SET name=?,color=?,updated_at=? WHERE id=?',
      ).run(v.name, v.color, clock(), BigInt(id))
      putParticipants(id, v.participants)
      return getProject(id)
    }),
    deleteProject: db.transaction(({ id }: { id: string; confirmed: true }) => {
      getProject(id)
      db.prepare('DELETE FROM projects WHERE id=?').run(BigInt(id))
      return { id }
    }),
    createSchedule: db.transaction((input: ScheduleInput) => {
      getProject(input.projectId)
      const v = dates(input),
        now = clock()
      const info = db
        .prepare(
          'INSERT INTO schedules(project_id,name,start_date,end_date,created_at,updated_at) VALUES(?,?,?,?,?,?)',
        )
        .run(BigInt(input.projectId), v.name, v.startDate, v.endDate, now, now)
      return getSchedule(String(info.lastInsertRowid))
    }),
    updateSchedule: db.transaction((input: ScheduleUpdate) => {
      const id = validateId(input.id)
      getSchedule(id)
      const v = dates(input)
      db.prepare(
        'UPDATE schedules SET name=?,start_date=?,end_date=?,updated_at=? WHERE id=?',
      ).run(v.name, v.startDate, v.endDate, clock(), BigInt(id))
      return getSchedule(id)
    }),
    deleteSchedule: db.transaction(({ id }: { id: string }) => {
      getSchedule(id)
      db.prepare('DELETE FROM schedules WHERE id=?').run(BigInt(id))
      return { id }
    }),
  }
}
