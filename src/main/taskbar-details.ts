import {win32} from 'node:path'
import type {BrowserWindow} from 'electron'

export function configureTaskbarDetails(
  window: Pick<BrowserWindow, 'setAppDetails'>,
  options: {platform: string; packaged: boolean; exePath: string; shellIconName: string},
) {
  if (options.platform !== 'win32' || !options.packaged) return
  window.setAppDetails({
    appId: 'com.kdydesign.simpletimeline',
    appIconPath: win32.join(win32.dirname(options.exePath), 'resources', options.shellIconName),
    appIconIndex: 0,
    relaunchCommand: `"${options.exePath}"`,
    relaunchDisplayName: 'WorkRail',
  })
}
