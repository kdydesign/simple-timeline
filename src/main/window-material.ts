import type {BrowserWindowConstructorOptions} from 'electron'

/** Native backdrop keeps the regular, resizable window on supported Windows. */
export function windowMaterial(platform: string, release: string): Pick<BrowserWindowConstructorOptions, 'backgroundColor' | 'backgroundMaterial'> {
  const version = /^(\d+)\.(\d+)\.(\d+)$/.exec(release)
  if (platform === 'win32' && version && Number(version[1]) >= 10 && Number(version[3]) >= 22621) {
    return {backgroundMaterial:'acrylic',backgroundColor:'#00000000'}
  }
  return {backgroundColor:'#DCECE6'}
}
