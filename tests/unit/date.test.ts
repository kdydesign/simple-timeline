import { describe, it, expect } from 'vitest'
import { parseBusinessDate, toOrdinal, fromOrdinal, inclusiveDays, monthBounds, shiftMonth } from '../../src/domain/date'
describe('business dates independent of timezone', () => {
  it.each(['1900-02-29','0000-01-01','10000-01-01','2026-2-01','2026-11-01T00:00:00Z','2026-04-31',''])('rejects %s', date => expect(() => parseBusinessDate(date)).toThrow())
  it.each(['0001-01-01','2000-02-29','9999-12-31'])('preserves %s', date => expect(parseBusinessDate(date)).toBe(date))
  it('counts inclusive days across leap and month boundaries', () => {
    expect(inclusiveDays('2028-02-28','2028-03-01')).toBe(3)
    expect(inclusiveDays('2026-11-01','2026-12-22')).toBe(52)
    expect(inclusiveDays('2026-12-18','2026-12-18')).toBe(1)
    expect(() => inclusiveDays('2026-12-22','2026-11-01')).toThrow()
  })
  it('round trips extreme ordinals without Date year coercion', () => {
    expect(toOrdinal('0001-01-01')).toBe(1)
    expect(toOrdinal('9999-12-31')).toBe(3652059)
    expect(fromOrdinal(3652059)).toBe('9999-12-31')
    expect(fromOrdinal(1)).toBe('0001-01-01')
    expect(() => fromOrdinal(3652060)).toThrow()
  })
  it('bounds months and disables movement beyond supported years', () => {
    expect(monthBounds({year:2028,month:2})).toEqual({start:'2028-02-01',end:'2028-02-29'})
    expect(shiftMonth({year:1,month:1},-1)).toBeNull()
    expect(shiftMonth({year:9999,month:12},1)).toBeNull()
    expect(shiftMonth({year:2026,month:12},1)).toEqual({year:2027,month:1})
  })
})
