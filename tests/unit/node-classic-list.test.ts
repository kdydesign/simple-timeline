import { expect, it } from 'vitest'
import { classicListContains } from '../../src/main/node-management/classic-list'

it('accepts only a complete version row from the installed-list command', () => {
  for (const output of ['\r\n    22.13.1\r\n', '* 22.13.1 (Currently using 64-bit executable)']) {
    expect(classicListContains(output, '22.13.1')).toBe(true)
  }
  for (const output of ['22.13.10', 'Download failed for 22.13.1', '22.13.1-beta.1', 'No installations recognized.']) {
    expect(classicListContains(output, '22.13.1')).toBe(false)
  }
})
