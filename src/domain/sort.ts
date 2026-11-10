import { parseSharedId } from './sharing'
import type { TimelineSnapshot } from '../shared/types'
export const compareIds = (a: string, b: string): number => {
  const remoteA = a.startsWith('shared:'), remoteB = b.startsWith('shared:')
  if (remoteA !== remoteB) return remoteA ? 1 : -1
  if (remoteA && remoteB) {
    const aa = parseSharedId(a), bb = parseSharedId(b)
    return aa.hostId.localeCompare(bb.hostId) || aa.datasetId.localeCompare(bb.datasetId) || compareIds(aa.remoteId, bb.remoteId)
  }
  return BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0
}
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
