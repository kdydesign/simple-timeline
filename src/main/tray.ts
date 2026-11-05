import { Menu, Tray } from 'electron'
export function createTray(icon: string, show: () => void, requestQuit: () => void): Tray {
  const tray = new Tray(icon)
  try {
    tray.setToolTip('Planrail')
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '열기', click: show },
      { label: '종료', click: requestQuit },
    ]))
    tray.on('click', show)
    return tray
  } catch (error) {
    tray.destroy()
    throw error
  }
}
