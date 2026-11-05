import type { ReminderSettings, Schedule } from '../shared/types'
import { DomainValidationError } from './error'
import { fromOrdinal, toOrdinal } from './date'
export const DEFAULT_REMINDER: Readonly<ReminderSettings> = {daysBefore:2,time:'09:00',start:false,end:false}
export function normalizeReminder(value:unknown,startDate:string,endDate:string):ReminderSettings {
  if(value===undefined)return {...DEFAULT_REMINDER}
  if(!value || typeof value!=='object' || Array.isArray(value))throw new DomainValidationError('reminder')
  const v=value as Record<string,unknown>
  if(Object.keys(v).length!==4 || Object.keys(v).some(k=>!['daysBefore','time','start','end'].includes(k)))throw new DomainValidationError('reminder')
  if(typeof v.daysBefore!=='number' || !Number.isInteger(v.daysBefore) || v.daysBefore<0 || v.daysBefore>365)throw new DomainValidationError('daysBefore','알림은 0~365일 전의 정수로 입력해 주세요.')
  if(typeof v.time!=='string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time))throw new DomainValidationError('reminderTime','알림 시각은 00:00~23:59로 입력해 주세요.')
  if(typeof v.start!=='boolean'||typeof v.end!=='boolean')throw new DomainValidationError('reminder')
  if((v.start && toOrdinal(startDate)-v.daysBefore<1)||(v.end && toOrdinal(endDate)-v.daysBefore<1))throw new DomainValidationError('daysBefore','알림 날짜가 0001-01-01 이전입니다. 알림 설정을 먼저 조정해 주세요.')
  return {daysBefore:v.daysBefore,time:v.time,start:v.start,end:v.end}
}
export interface ReminderOccurrence {key:string;scheduleId:string;kind:'start'|'end';targetDate:string;dueDate:string;daysBefore:number;time:string}
export function localClock(now:Date) {
  return {date:`${String(now.getFullYear()).padStart(4,'0')}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`,time:`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`}
}
export function dueReminders(schedule:Schedule,now:Date):ReminderOccurrence[] {
  const r=schedule.reminder,local=localClock(now)
  if(!r || local.time<r.time)return []
  return (['start','end'] as const).flatMap(kind=>{
    if(!r[kind])return []
    const targetDate=kind==='start'?schedule.startDate:schedule.endDate
    const due=toOrdinal(targetDate)-r.daysBefore
    if(due<1 || fromOrdinal(due)!==local.date)return []
    return [{key:JSON.stringify([schedule.id,kind,targetDate,r.daysBefore,r.time]),scheduleId:schedule.id,kind,targetDate,dueDate:local.date,daysBefore:r.daysBefore,time:r.time}]
  })
}
