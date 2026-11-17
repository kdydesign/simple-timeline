import {describe,it,expect} from 'vitest'
import {validateHolidayCalendar,holidayName,validateHolidayEnvelope,reportedVersion} from '../../src/domain/holidays'
import {DEFAULT_HOLIDAYS} from '../../src/shared/holidays'
describe('host common holiday calendar',()=>{
 it('uses exact dates before weekly rules and permits removing all weekends',()=>{
  expect(holidayName('2026-11-21',DEFAULT_HOLIDAYS)).toBe('매주 토요일 휴무')
  const c=validateHolidayCalendar({weekdays:[3],dates:[{date:'2026-11-18',name:' 창립일 '}]})
  expect(holidayName('2026-11-18',c)).toBe('창립일')
  expect(holidayName('2026-11-21',c)).toBe('')
  expect(validateHolidayCalendar({weekdays:[],dates:[]})).toEqual({weekdays:[],dates:[]})
 })
 it('rejects duplicate dates, blank names, invalid leap dates and unknown keys',()=>{
  for(const dates of [[{date:'2026-02-29',name:'x'}],[{date:'2026-01-01',name:' '}],[{date:'2026-01-01',name:'a'},{date:'2026-01-01',name:'b'}]])expect(()=>validateHolidayCalendar({weekdays:[],dates})).toThrow()
  expect(()=>validateHolidayCalendar({weekdays:[7],dates:[]})).toThrow()
  expect(()=>validateHolidayCalendar({weekdays:[0,0],dates:[]})).toThrow()
  expect(()=>validateHolidayCalendar({weekdays:[],dates:[],extra:true})).toThrow()
  expect(validateHolidayCalendar({weekdays:[],dates:[{date:'0001-01-01',name:'처음'},{date:'9999-12-31',name:'끝'},{date:'2028-02-29',name:'윤일'}]}).dates).toHaveLength(3)
 })
 it('bounds untrusted data and app versions without blocking legacy clients',()=>{
  expect(reportedVersion(undefined)).toBeNull();expect(reportedVersion('0.8.6')).toBe('0.8.6')
  expect(reportedVersion('0.8.6-dev')).toBe('0.8.6-dev');expect(reportedVersion('bad\r\nvalue')).toBeNull()
  expect(()=>validateHolidayEnvelope({schemaVersion:1,hostId:'bad',datasetId:'bad',revision:'x',calendar:DEFAULT_HOLIDAYS})).toThrow()
 })
})

it('accepts bounded SemVer prerelease/build identifiers without accepting arbitrary text',()=>{expect(reportedVersion('0.8.6-rc.1+build.2')).toBe('0.8.6-rc.1+build.2');expect(reportedVersion('0.8.6-01')).toBeNull()})
