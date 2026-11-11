import type {
  Id,
  Project,
  ProjectInput,
  Schedule,
  ScheduleInput,
  ScheduleUpdate,
  ReminderSettings,
  TimelineSnapshot,
  Result,
  ErrorCode,
} from './types'
export interface TimelineApi {
  getStatus(): Promise<
    Result<{ state: 'ready' | 'blocked'; errorCode?: ErrorCode }>
  >
  getSnapshot(): Promise<Result<TimelineSnapshot>>
  createProject(input: ProjectInput): Promise<Result<Project>>
  updateProject(input: ProjectInput & { id: Id }): Promise<Result<Project>>
  deleteProject(input: { id: Id; confirmed: true }): Promise<Result<{ id: Id }>>
  createSchedule(input: ScheduleInput): Promise<Result<Schedule>>
  updateSchedule(input: ScheduleUpdate): Promise<Result<Schedule>>
  updateScheduleReminder(input: { id: Id; reminder: ReminderSettings }): Promise<Result<Schedule>>
  deleteSchedule(input: { id: Id }): Promise<Result<{ id: Id }>>
}
export const channels = {
  getStatus: 'app:status',
  getSnapshot: 'timeline:snapshot',
  createProject: 'project:create',
  updateProject: 'project:update',
  deleteProject: 'project:delete',
  createSchedule: 'schedule:create',
  updateSchedule: 'schedule:update',
  deleteSchedule: 'schedule:delete',
  updateScheduleReminder: 'schedule:reminder',
} as const satisfies Record<keyof TimelineApi, string>
export type MutationName = Exclude<
  keyof TimelineApi,
  'getStatus' | 'getSnapshot'
>
