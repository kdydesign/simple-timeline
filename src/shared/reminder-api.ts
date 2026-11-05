import type {Result} from './types'
export interface ReminderState {
 failed:number
 unknown:number
 storageError:boolean
 openRequest:{token:number;scheduleId:string}|null
}
export interface ReminderApi {
 getState():Promise<Result<ReminderState>>
 retry():Promise<Result<ReminderState>>
 acknowledge(token:number):Promise<Result<ReminderState>>
 onChange(callback:()=>void):()=>void
}
export const reminderChannel='reminder:command'
export const reminderChanged='reminder:changed'
