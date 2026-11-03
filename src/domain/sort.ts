import type { TimelineSnapshot } from '../shared/types'
export const compareIds = (a: string, b: string): number =>
  BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0
export const sortSnapshot = (data: TimelineSnapshot): TimelineSnapshot => ({
  projects: [...data.projects].sort((a, b) => compareIds(a.id, b.id)),
  schedules: [...data.schedules].sort(
    (a, b) =>
      compareIds(a.projectId, b.projectId) ||
      a.startDate.localeCompare(b.startDate) ||
      a.endDate.localeCompare(b.endDate) ||
      compareIds(a.id, b.id),
  ),
})
