import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const icon = readFileSync(new URL('../../resources/icon.ico', import.meta.url))
export const shellIconName = `WorkRail-${createHash('sha256').update(icon).digest('hex')}.ico`
