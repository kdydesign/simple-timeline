import { it, expect } from 'vitest'
import {
  normalizeName,
  normalizeParticipants,
  normalizeColor,
} from '../../src/domain/normalize'
it('trims Unicode outer whitespace without merging meaningful names', () => {
  expect(normalizeName('\u2003 QA  Team \u3000')).toBe('QA  Team')
  expect(() => normalizeName(' \t ')).toThrow()
  expect(() => normalizeName(4)).toThrow()
  expect(
    normalizeParticipants([' 민수 ', '', '민수', 'Jin', 'jin', 'A  B', 'A B']),
  ).toEqual(['민수', 'Jin', 'jin', 'A  B', 'A B'])
  expect(() => normalizeParticipants('민수')).toThrow()
  expect(() => normalizeParticipants([1])).toThrow()
})
it('requires a full hex color and canonicalizes case', () => {
  expect(normalizeColor('#ab12ef')).toBe('#AB12EF')
  expect(() => normalizeColor('red')).toThrow()
  expect(() => normalizeColor('#abc')).toThrow()
})
