import { createMutationBarrier } from './updates/installer'
export const appMutationBarrier = createMutationBarrier()
import type { StorageState } from './db/lifecycle'
import type { Result, ProjectInput, ScheduleInput } from '../shared/types'
import {
  normalizeName,
  normalizeColor,
  normalizeParticipants,
  validateId,
} from '../domain/normalize'
import { parseBusinessDate, inclusiveDays } from '../domain/date'
import { normalizeReminder } from '../domain/reminder'
import { DomainValidationError } from '../domain/error'
import { toPublicError, failure } from './errors'
interface Sender {
  sender: unknown
  senderFrame: { url: string } | null
}
interface Window {
  isDestroyed(): boolean
  webContents: { mainFrame: unknown }
}
export function resolveRendererUrl(
  local: string,
  options: { packaged: boolean; development: boolean; devUrl?: string },
): string {
  if (options.packaged || !options.development || !options.devUrl) return local
  const url = new URL(options.devUrl)
  if (
    url.origin !== 'http://127.0.0.1:5173' ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw failure('FORBIDDEN')
  return url.href
}
export function isTrustedSender(
  event: unknown,
  window: unknown,
  allowedUrl: string,
): boolean {
  try {
    const e = event as Sender,
      w = window as Window
    if (
      w.isDestroyed() ||
      e.sender !== w.webContents ||
      !e.senderFrame ||
      e.senderFrame !== w.webContents.mainFrame
    )
      return false
    const actual = new URL(e.senderFrame.url),
      allowed = new URL(allowedUrl)
    return allowed.protocol === 'file:'
      ? actual.href === allowed.href
      : actual.origin === allowed.origin && allowed.protocol === 'http:'
  } catch {
    return false
  }
}
const keys: Record<string, readonly string[]> = {
  createProject: ['name', 'color', 'participants'],
  updateProject: ['id', 'name', 'color', 'participants'],
  deleteProject: ['id', 'confirmed'],
  createSchedule: ['projectId', 'name', 'startDate', 'endDate'],
  updateSchedule: ['id', 'name', 'startDate', 'endDate'],
  deleteSchedule: ['id'],
  updateScheduleReminder: ['id', 'reminder'],
}
function input(method: string, args: readonly unknown[]): unknown {
  if (method === 'getStatus' || method === 'getSnapshot') {
    if (args.length) throw new DomainValidationError('input')
    return undefined
  }
  const value = args[0]
  if (
    !keys[method] ||
    args.length !== 1 ||
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![null, Object.prototype].includes(Object.getPrototypeOf(value))
  )
    throw new DomainValidationError('input')
  const v = value as Record<string, unknown>
  const hasReminder = (method==='createSchedule'||method==='updateSchedule') && Object.hasOwn(v,'reminder')
  const expected = hasReminder ? [...keys[method], 'reminder'] : keys[method]
  if (Object.keys(v).length !== expected.length || Object.keys(v).some(k=>!expected.includes(k)))
    throw new DomainValidationError('input')
  const id =
    method.startsWith('update') || method.startsWith('delete')
      ? validateId(v.id)
      : undefined
  if (method === 'updateScheduleReminder') {
    if (!v.reminder) throw new DomainValidationError('reminder')
    // Shape validation here; actual saved dates are checked inside the DB transaction.
    return {id, reminder: normalizeReminder(v.reminder, '9999-12-31', '9999-12-31')}
  }
  if (method.startsWith('delete')) {
    if (method === 'deleteProject' && v.confirmed !== true)
      throw new DomainValidationError('confirmed')
    return method === 'deleteProject' ? { id, confirmed: true } : { id }
  }
  if (method.endsWith('Project')) {
    const p: ProjectInput = {
      name: normalizeName(v.name),
      color: normalizeColor(v.color),
      participants: normalizeParticipants(v.participants),
    }
    return id ? { id, ...p } : p
  }
  const startDate = parseBusinessDate(v.startDate, 'startDate'),
    endDate = parseBusinessDate(v.endDate, 'endDate')
  inclusiveDays(startDate, endDate)
  const s: Omit<ScheduleInput, 'projectId'> = {
    ...(hasReminder ? {reminder:normalizeReminder(v.reminder,startDate,endDate)} : {}),
    name: normalizeName(v.name),
    startDate,
    endDate,
  }
  return id
    ? { id, ...s }
    : { ...s, projectId: validateId(v.projectId, 'projectId') }
}
export function dispatch(
  storage: StorageState,
  method: string,
  args: readonly unknown[],
  trusted: boolean,
): Result<unknown> {
  try {
    if (!trusted || appMutationBarrier.blocked()) throw failure('FORBIDDEN')
    const v = input(method, args)
    if (method === 'getStatus')
      return {
        ok: true,
        data:
          storage.state === 'ready'
            ? { state: 'ready' }
            : { state: 'blocked', errorCode: storage.error.code },
      }
    if (storage.state === 'blocked') return { ok: false, error: storage.error }
    const fn = storage.repository[
      method as keyof typeof storage.repository
    ] as (value: unknown) => unknown
    const data = fn(v)
    JSON.stringify(data) // Reject non-DTO values before Electron attempts serialization.
    return { ok: true, data }
  } catch (error) {
    return { ok: false, error: toPublicError(error) }
  }
}
