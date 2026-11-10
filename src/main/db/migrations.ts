import type { DatabaseHandle } from './repository'
import { createSchema } from './schema'
import { addReminders } from './reminders'
import { addSharing } from './sharing/schema'
export interface Migration {
  version: number
  up(db: DatabaseHandle): void
}
export const migrations: Migration[] = [{ version: 1, up: createSchema }, { version: 2, up: addReminders }, { version: 3, up: addSharing }]
