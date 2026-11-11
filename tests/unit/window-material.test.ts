import {describe, expect, it} from 'vitest'
import {windowMaterial} from '../../src/main/window-material'

describe('resizable Windows backdrop selection', () => {
  it('uses native acrylic on Windows 11 22H2 and newer', () => {
    expect(windowMaterial('win32', '10.0.22621')).toEqual({backgroundMaterial:'acrylic',backgroundColor:'#00000000'})
    expect(windowMaterial('win32', '10.0.26100')).toHaveProperty('backgroundMaterial', 'acrylic')
    expect(windowMaterial('win32', '10.0.26100')).not.toHaveProperty('transparent')
  })
  it.each([['win32','10.0.19045'], ['win32','10.0.22000'], ['win32','unknown'], ['linux','6.18.57'], ['darwin','24.0.0']])('keeps an opaque native fallback on %s %s', (platform, release) => {
    expect(windowMaterial(platform, release)).toEqual({backgroundColor:'#D3D6DB'})
  })
})
