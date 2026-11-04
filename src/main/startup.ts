import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
// No schedule content or paths are recorded. This replaces the prior run only.
export function startupRecorder(profile: string, appVersion: string) {
  const stages: Record<string, number> = {}
  let writes = Promise.resolve()
  return {
    mark(name: string) {
      if (name in stages) return
      stages[name] = Math.round(process.uptime() * 1000)
      const report = JSON.stringify({
        schemaVersion: 1, platform: process.platform, electronVersion: process.versions.electron, appVersion,
        recordedAt: new Date().toISOString(), clock: 'milliseconds-since-process-start', stages: {...stages},
      }, null, 2)
      // Serialize snapshots so a slower early write cannot replace later evidence.
      writes = writes.then(() => writeFile(join(profile, 'startup-latest.json'), report)).catch(() => {})
    },
  }
}
