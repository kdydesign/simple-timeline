import { expect, it } from 'vitest'
import { toOrdinal } from '../../src/domain/date'
import { isWeekend } from '../../src/visualization/weekends'

it.each([
  ['0001-01-01', false], ['2026-11-06', false], ['2026-11-07', true],
  ['2026-11-08', true], ['2026-11-09', false], ['9999-12-31', false],
])('classifies %s without a timezone conversion', (date, weekend) => {
  expect(isWeekend(toOrdinal(date))).toBe(weekend)
})
