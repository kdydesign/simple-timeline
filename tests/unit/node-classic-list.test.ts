import { expect, it } from 'vitest'
import { parseClassicList, parseModernList } from '../../src/main/node-management/classic-list'

it('accepts only a complete version row from the installed-list command', () => {
  for (const output of ['\r\n    22.13.1\r\n', '* 22.13.1 (Currently using 64-bit executable)']) {
    expect(parseClassicList(output)).toEqual(['22.13.1'])
  }
  for (const output of ['22.13.10', 'Download failed for 22.13.1', '22.13.1-beta.1', 'No installations recognized.']) {
    expect(parseClassicList(output)?.includes('22.13.1')).not.toBe(true)
  }
})

it('distinguishes an empty classic installation from an unknown inventory format', () => {
  expect(parseClassicList('No installations recognized.')).toEqual([])
  expect(parseClassicList('Failed to read registry')).toBeNull()
  expect(parseClassicList('')).toBeNull()
})

it('matches exact installed rows from the modern offline table', () => {
  expect(parseModernList('  24.1.0    \r\n* 22.9.0   (default)\r\n')).toEqual(['24.1.0', '22.9.0'])
  expect(parseModernList('22.9.01')).toBeNull()
  expect(parseModernList('No versions installed.')).toEqual([])
})
