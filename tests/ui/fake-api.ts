import type { TimelineApi } from '../../src/shared/api'
import type {
  TimelineSnapshot,
  ProjectInput,
  Project,
  ScheduleInput,
  Schedule,
} from '../../src/shared/types'
export function memoryApi(
  initial: TimelineSnapshot = { projects: [], schedules: [] },
) {
  let snapshot = structuredClone(initial),
    sequence = 100
  let creates = 0
  const time = '2026-11-03T00:00:00.000Z'
  const api: TimelineApi = {
    async getStatus() {
      return { ok: true, data: { state: 'ready' } }
    },
    async getSnapshot() {
      return { ok: true, data: structuredClone(snapshot) }
    },
    async createProject(input: ProjectInput) {
      creates++
      const p: Project = {
        ...input,
        id: String(++sequence),
        createdAt: time,
        updatedAt: time,
      }
      snapshot.projects.push(p)
      return { ok: true, data: p }
    },
    async updateProject(input) {
      snapshot.projects = snapshot.projects.map((p) =>
        p.id === input.id ? { ...p, ...input } : p,
      )
      return {
        ok: true,
        data: snapshot.projects.find((p) => p.id === input.id)!,
      }
    },
    async deleteProject({ id }) {
      snapshot.projects = snapshot.projects.filter((p) => p.id !== id)
      snapshot.schedules = snapshot.schedules.filter((s) => s.projectId !== id)
      return { ok: true, data: { id } }
    },
    async createSchedule(input: ScheduleInput) {
      const s: Schedule = {
        ...input,
        reminder: input.reminder ?? {daysBefore:2,time:'09:00',start:false,end:false},
        id: String(++sequence),
        createdAt: time,
        updatedAt: time,
      }
      snapshot.schedules.push(s)
      return { ok: true, data: s }
    },
    async updateSchedule(input) {
      snapshot.schedules = snapshot.schedules.map((s) =>
        s.id === input.id ? { ...s, ...input } : s,
      )
      return {
        ok: true,
        data: snapshot.schedules.find((s) => s.id === input.id)!,
      }
    },
    async deleteSchedule({ id }) {
      snapshot.schedules = snapshot.schedules.filter((s) => s.id !== id)
      return { ok: true, data: { id } }
    },
  }
  return {
    api,
    get snapshot() {
      return snapshot
    },
    get creates() {
      return creates
    },
  }
}
