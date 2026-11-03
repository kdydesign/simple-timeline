import { app } from 'electron'
import { resolve, relative, isAbsolute } from 'node:path'
import { tmpdir } from 'node:os'
import { bootstrap } from '../../src/main/bootstrap'
import type { Result } from '../../src/shared/types'
const requested = process.env.SIMPLE_TIMELINE_TEST_PROFILE
if (!requested) throw Error('Test profile required')
const profile = resolve(requested),
  rel = relative(tmpdir(), profile)
if (
  isAbsolute(rel) ||
  rel.startsWith('..') ||
  !rel.startsWith('simple-timeline-')
)
  throw Error('Isolated temporary profile required')
let changed = false,
  injected = false
const fault = process.env.SIMPLE_TIMELINE_TEST_FAULT
void bootstrap({
  profileDir: profile,
  notifyBlocked() {},
  confirmClose: async () => true,
  afterDispatch(method, result): Result<unknown> {
    if (method === 'createProject' && result.ok) {
      changed = true
      if (fault === 'lost' && !injected) {
        injected = true
        throw Error('Test response lost after commit')
      }
    }
    if (
      method === 'getSnapshot' &&
      fault === 'refresh' &&
      changed &&
      !injected
    ) {
      injected = true
      return {
        ok: false,
        error: { code: 'STORAGE_IO', message: '읽기에 실패했습니다.' },
      }
    }
    return result
  },
}).catch((error) => {
  console.error(error)
  app.exit(1)
})
