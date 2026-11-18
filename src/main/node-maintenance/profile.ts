import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

export function prepareMaintenanceProfile(maintenanceRoot: string) {
  const userData = join(maintenanceRoot, 'profile')
  const sessionData = join(userData, 'session')
  // Complete directory creation before Electron's synchronous setPath calls.
  mkdirSync(sessionData, { recursive: true, mode: 0o700 })
  return { userData, sessionData }
}
