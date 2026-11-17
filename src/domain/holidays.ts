import {DomainValidationError} from './error'
import {parseBusinessDate,toOrdinal,fromOrdinal} from './date'
import {validateSharingIdentity} from './sharing'
import {DEFAULT_HOLIDAYS,type HolidayCalendar,type HolidayEnvelope,type HolidayDate} from '../shared/holidays'
export const MAX_HOLIDAYS=1000
function object(v:unknown,keys:string[],field='calendar'):Record<string,unknown>{
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))throw new DomainValidationError(field)
 return v as Record<string,unknown>
}
export function validateHolidayCalendar(value:unknown):HolidayCalendar{
 const v=object(value,['weekdays','dates'])
 if(!Array.isArray(v.weekdays)||v.weekdays.length>7||v.weekdays.some(d=>!Number.isInteger(d)||d<0||d>6)||new Set(v.weekdays).size!==v.weekdays.length)throw new DomainValidationError('weekdays','반복 요일을 확인해 주세요.')
 if(!Array.isArray(v.dates)||v.dates.length>MAX_HOLIDAYS)throw new DomainValidationError('dates','휴일은 최대 1,000개까지 등록할 수 있습니다.')
 let covered=0
 const dates:HolidayDate[]=v.dates.map(raw=>{
  const hasEnd=!!raw&&typeof raw==='object'&&Object.hasOwn(raw,'endDate')
  const item=object(raw,hasEnd?['date','endDate','name']:['date','name'])
  let date:string,endDate:string
  try{date=parseBusinessDate(item.date)}catch{throw new DomainValidationError('date','시작일을 YYYY-MM-DD 형식으로 입력해 주세요.')}
  try{endDate=hasEnd?parseBusinessDate(item.endDate):date}catch{throw new DomainValidationError('endDate','종료일을 YYYY-MM-DD 형식으로 입력해 주세요.')}
  if(endDate<date)throw new DomainValidationError('endDate','종료일은 시작일보다 빠를 수 없습니다.')
  covered+=toOrdinal(endDate)-toOrdinal(date)+1
  if(covered>MAX_HOLIDAYS)throw new DomainValidationError('endDate','등록된 휴일의 총 날짜는 1,000일까지 가능합니다.')
  if(typeof item.name!=='string'||!item.name.trim()||item.name.trim().length>100||/[\u0000-\u001f\u007f]/.test(item.name))throw new DomainValidationError('name','휴일 이름을 1~100자로 입력해 주세요.')
  return {date,...(endDate!==date?{endDate}:{}),name:item.name.trim()}
 })
 for(let i=1;i<dates.length;i++){
  const current=dates[i],previous=dates.slice(0,i).find(d=>d.date<=(current.endDate??current.date)&&current.date<=(d.endDate??d.date))
  if(previous)throw new DomainValidationError('date',`${previous.name} (${previous.date} ~ ${previous.endDate??previous.date})와 기간이 겹칩니다. 기존 휴일을 수정해 주세요.`)
 }
 dates.sort((a,b)=>a.date.localeCompare(b.date))
 return {weekdays:[...v.weekdays].sort((a,b)=>a-b),dates}
}
export function validateHolidayEnvelope(value:unknown):HolidayEnvelope{
 const v=object(value,['schemaVersion','hostId','datasetId','revision','calendar'])
 if(v.schemaVersion!==1)throw new DomainValidationError('schemaVersion')
 return {schemaVersion:1,hostId:validateSharingIdentity(v.hostId),datasetId:validateSharingIdentity(v.datasetId),revision:validateSharingIdentity(v.revision),calendar:validateHolidayCalendar(v.calendar)}
}
export function holidayName(date:string,calendar:HolidayCalendar=DEFAULT_HOLIDAYS):string{
 const named=namedHoliday(date,calendar)
 if(named)return named.name
 const day=toOrdinal(date)%7
 return calendar.weekdays.includes(day)?`매주 ${['일','월','화','수','목','금','토'][day]}요일 휴무`:''
}
/** Named dates only: recurring weekdays keep their tint but have no text/marker. */
export function namedHoliday(date:string,calendar:HolidayCalendar=DEFAULT_HOLIDAYS):HolidayDate|undefined{
 return calendar.dates.find(d=>d.date<=date&&date<=(d.endDate??d.date))
}
/** Legacy peers only understand independent dates. Validate before bounded expansion. */
export function expandHolidayCalendar(value:HolidayCalendar):HolidayCalendar{
 const calendar=validateHolidayCalendar(value)
 return {weekdays:calendar.weekdays,dates:calendar.dates.flatMap(d=>{
  const start=toOrdinal(d.date),end=toOrdinal(d.endDate??d.date)
  return Array.from({length:end-start+1},(_,i)=>({date:fromOrdinal(start+i),name:d.name}))
 })}
}
export function reportedVersion(value:unknown):string|null{
 return typeof value==='string'&&value.length<=64&&/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value)?value:null
}
