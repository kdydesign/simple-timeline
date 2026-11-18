import {describe,it,expect} from 'vitest'
import {workingDays,namedHolidays,effectiveHolidayCalendar} from '../../src/domain/holidays'
const sources={common:{weekdays:[0,6],dates:[{date:'2026-11-25',name:'창립기념일'}]},personal:{weekdays:[0,6],dates:[{date:'2026-11-26',name:'연차'}]}}
describe('local holiday union',()=>{
 it('excludes each common and personal day once without modifying either source',()=>{
  expect(workingDays('2026-11-23','2026-11-29',sources)).toBe(3)
  const duplicate={...sources,personal:{weekdays:[0,6],dates:[{date:'2026-11-25',name:'연차'}]}}
  expect(workingDays('2026-11-23','2026-11-29',duplicate)).toBe(4)
  expect(namedHolidays('2026-11-25',duplicate).map(x=>[x.source,x.holiday.name])).toEqual([['common','창립기념일'],['personal','연차']])
  expect(sources.personal.dates).toEqual([{date:'2026-11-26',name:'연차'}])
 })
 it('counts inclusive boundaries and leap days across the supported range',()=>{
  expect(workingDays('0001-01-01','9999-12-31',{personal:{weekdays:[],dates:[]}})).toBe(3652059)
  expect(workingDays('2024-02-28','2024-03-01',{personal:{weekdays:[],dates:[{date:'2024-02-29',name:'연차'}]}})).toBe(2)
  expect(workingDays('2026-11-25','2026-11-25',sources)).toBe(0)
  expect(workingDays('2026-11-23','2026-11-29',{personal:{weekdays:[0,1,2,3,4,5,6],dates:[]}})).toBe(0)
  expect(()=>workingDays('2026-11-26','2026-11-25',sources)).toThrow()
 })
 it('unions overlapping named periods and weekdays, retaining both named sources',()=>{
  const s={common:{weekdays:[0,6],dates:[{date:'2026-11-23',endDate:'2026-11-26',name:'공통'}]},personal:{weekdays:[3],dates:[{date:'2026-11-25',endDate:'2026-11-27',name:'개인'}]}}
  expect(workingDays('2026-11-23','2026-11-29',s)).toBe(0)
  expect(effectiveHolidayCalendar(s).weekdays).toEqual([0,3,6])
  expect(namedHolidays('2026-11-28',s)).toEqual([])
 })
})

it('drops revoked common holidays but keeps local choices in every role',async()=>{
 const {localHolidaySources}=await import('../../src/renderer/state/holidaySources')
 const personal={weekdays:[3],dates:[{date:'2026-11-26',name:'개인'}]},common={weekdays:[4],dates:[{date:'2026-11-25',name:'공통'}]}
 const state={role:'member',status:'disconnected',personalHolidays:personal,holidays:{calendar:common}} as any
 expect(localHolidaySources(state)).toEqual({personal,common})
 expect(localHolidaySources({...state,status:'revoked'})).toEqual({personal,common:undefined})
 expect(localHolidaySources({...state,role:'personal'})).toEqual({personal,common:undefined})
 expect(localHolidaySources({...state,role:'host'})).toEqual({personal,common})
})
