import {DomainValidationError} from './error'
import {parseBusinessDate,toOrdinal} from './date'
import {validateSharingIdentity} from './sharing'
import {DEFAULT_HOLIDAYS,type HolidayCalendar,type HolidayEnvelope} from '../shared/holidays'
export const MAX_HOLIDAYS=1000
function object(v:unknown,keys:string[],field='calendar'):Record<string,unknown>{
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))throw new DomainValidationError(field)
 return v as Record<string,unknown>
}
export function validateHolidayCalendar(value:unknown):HolidayCalendar{
 const v=object(value,['weekdays','dates'])
 if(!Array.isArray(v.weekdays)||v.weekdays.length>7||v.weekdays.some(d=>!Number.isInteger(d)||d<0||d>6)||new Set(v.weekdays).size!==v.weekdays.length)throw new DomainValidationError('weekdays','반복 요일을 확인해 주세요.')
 if(!Array.isArray(v.dates)||v.dates.length>MAX_HOLIDAYS)throw new DomainValidationError('dates','휴일은 최대 1,000개까지 등록할 수 있습니다.')
 const seen=new Set<string>()
 const dates=v.dates.map(raw=>{
  const item=object(raw,['date','name']),date=parseBusinessDate(item.date)
  if(seen.has(date))throw new DomainValidationError('date','같은 날짜가 등록되어 있습니다. 기존 휴일을 수정해 주세요.')
  seen.add(date)
  if(typeof item.name!=='string'||!item.name.trim()||item.name.trim().length>100||/[\u0000-\u001f\u007f]/.test(item.name))throw new DomainValidationError('name','휴일 이름을 1~100자로 입력해 주세요.')
  return {date,name:item.name.trim()}
 }).sort((a,b)=>a.date.localeCompare(b.date))
 return {weekdays:[...v.weekdays].sort((a,b)=>a-b),dates}
}
export function validateHolidayEnvelope(value:unknown):HolidayEnvelope{
 const v=object(value,['schemaVersion','hostId','datasetId','revision','calendar'])
 if(v.schemaVersion!==1)throw new DomainValidationError('schemaVersion')
 return {schemaVersion:1,hostId:validateSharingIdentity(v.hostId),datasetId:validateSharingIdentity(v.datasetId),revision:validateSharingIdentity(v.revision),calendar:validateHolidayCalendar(v.calendar)}
}
export function holidayName(date:string,calendar:HolidayCalendar=DEFAULT_HOLIDAYS):string{
 const named=calendar.dates.find(d=>d.date===date)
 if(named)return named.name
 const day=toOrdinal(date)%7
 return calendar.weekdays.includes(day)?`매주 ${['일','월','화','수','목','금','토'][day]}요일 휴무`:''
}
export function reportedVersion(value:unknown):string|null{
 return typeof value==='string'&&value.length<=64&&/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value)?value:null
}
