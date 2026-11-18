import type {DatabaseHandle} from './repository'
import {DEFAULT_HOLIDAYS,type HolidayCalendar} from '../../shared/holidays'
import {validateHolidayCalendar} from '../../domain/holidays'
export function addPersonalHolidays(db:DatabaseHandle){
 db.exec('CREATE TABLE personal_holidays(singleton INTEGER PRIMARY KEY CHECK(singleton=1),calendar TEXT NOT NULL) STRICT;')
 db.prepare('INSERT INTO personal_holidays VALUES(1,?)').run(JSON.stringify(DEFAULT_HOLIDAYS))
}
export function createPersonalHolidays(db:DatabaseHandle){
 const read=():HolidayCalendar=>{
  const row=db.prepare('SELECT calendar FROM personal_holidays WHERE singleton=1').get() as {calendar:string}|undefined
  if(!row)throw Error('PERSONAL_HOLIDAYS_MISSING')
  return validateHolidayCalendar(JSON.parse(row.calendar))
 }
 return {read,save:db.transaction((value:unknown)=>{
  const calendar=validateHolidayCalendar(value)
  if(JSON.stringify(read())!==JSON.stringify(calendar))db.prepare('UPDATE personal_holidays SET calendar=? WHERE singleton=1').run(JSON.stringify(calendar))
  return read()
 })}
}
