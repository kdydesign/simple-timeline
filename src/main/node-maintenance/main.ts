import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadNodeCatalog } from '../node-management/catalog'
import { dispatchNodeManagement } from '../node-management/ipc-core'
import { createNodeManagementService, nodeManagementError } from '../node-management/service'
import { createWindowsNodeAdapter } from '../node-management/windows'
import { verifyMaintenance } from './runtime'

// This entry deliberately never boots the regular app, DB, sharing or updater.
const artifactDirectory = resolve(__dirname, '../..')
const maintenanceRoot = dirname(artifactDirectory)
const profile = join(maintenanceRoot, 'profile')
app.setPath('userData', profile)
app.setPath('sessionData', join(profile, 'session'))
app.setName('WorkRail Node Recovery')
const session = process.argv.find(value => value.startsWith('--workrail-maintenance-session='))?.split('=')[1]
const needsHandoff = Boolean(process.send)
let accepted = !needsHandoff
let window: BrowserWindow | undefined
let ready = false
let rendererReady = false
let artifactId = ''
let recoveryShortcut = ''
const localUrl = pathToFileURL(join(__dirname, 'maintenance-ui', 'index.html')).href
const service = createNodeManagementService({
  platform: process.platform, arch: process.arch,
  windows: createWindowsNodeAdapter(globalThis.fetch),
  loadCatalog: () => loadNodeCatalog(globalThis.fetch),
  changed(state) {
    if (ready && process.connected && process.send) process.send({type:'state',session,artifactId,pid:process.pid,busy:state.busy !== null}, () => {})
    if (ready && window && !window.isDestroyed() && window.webContents.getURL() === localUrl) window.webContents.send('node-maintenance:changed', state)
  },
})
function focus() { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus() } }
function sendReady() {
  if (!ready || !rendererReady || !process.connected || !process.send) return
  process.send({ type: 'ready', session, artifactId, pid: process.pid, rendererReady: true, shortcutReady: true, recoveryShortcut }, () => {})
}
process.on('message', value => {
  if (!value || typeof value !== 'object') return
  const message = value as Record<string, unknown>
  if (message.type === 'accepted' && message.session === session && message.artifactId === artifactId) {
    accepted = true
    void service.getState().then(state => window?.webContents.send('node-maintenance:changed', state))
  }
  if (message.type === 'focus') focus()
})
// A parent going away never terminates recovery, even during an elevated mutation.
process.on('disconnect', () => {})
app.on('before-quit', event => { if (service.isBusy()) { event.preventDefault(); window?.hide() } })
app.on('window-all-closed', () => { if (!service.isBusy()) app.quit() })
app.on('second-instance', focus)

async function createRecoveryShortcut() {
  const directory = join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'WorkRail')
  await mkdir(directory, { recursive: true })
  const shortcut = join(directory, 'WorkRail Node 환경 복구.lnk')
  const target = join(artifactDirectory, 'runtime', 'electron.exe')
  const args = `"${join(artifactDirectory, 'app')}"`
  if (!shell.writeShortcutLink(shortcut, 'create', { target, args, cwd: artifactDirectory, description: 'Node 없이 WorkRail Node 환경 복구를 계속합니다.' })) throw Error('복구 바로가기를 만들지 못했습니다.')
  const actual = shell.readShortcutLink(shortcut)
  if (actual.target !== target || actual.args !== args || actual.cwd !== artifactDirectory) throw Error('복구 바로가기를 확인하지 못했습니다.')
  return shortcut
}
async function start() {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw Error('Node 복구는 Windows x64에서 사용할 수 있습니다.')
  if (needsHandoff && (!session || !/^[a-f0-9]{64}$/.test(session))) throw Error('복구 창 인계 정보를 확인하지 못했습니다.')
  artifactId = await verifyMaintenance(artifactDirectory)
  if (resolve(process.execPath) !== resolve(artifactDirectory, 'runtime', 'electron.exe')) throw Error('독립 Electron 실행 경로를 확인하지 못했습니다.')
  recoveryShortcut = await createRecoveryShortcut()
  window = new BrowserWindow({
    title: 'WorkRail · Node 환경 복구', width: 900, height: 740, minWidth: 650, minHeight: 540,
    backgroundColor: '#151b23', show: false,
    webPreferences: { preload: join(__dirname, '../preload/node-maintenance.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true },
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
  window.webContents.on('will-attach-webview', event => event.preventDefault())
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  window.webContents.session.setPermissionCheckHandler(() => false)
  window.on('close', event => {
    if (service.isBusy()) { event.preventDefault(); window?.hide(); return }
    if (ready && !lastActiveVersion && dialog.showMessageBoxSync(window!, {
      type: 'info', title: 'Node 환경 복구', message: 'Node가 아직 준비되지 않았습니다.',
      detail: `개발 명령을 실행하려면 Node 설치와 사용 선택을 마쳐야 합니다. 시작 메뉴의 “WorkRail Node 환경 복구”로 돌아올 수 있습니다.\n${recoveryShortcut}`,
      buttons: ['계속 설정', '창 닫기'], defaultId: 0, cancelId: 0,
    }) === 0) event.preventDefault()
  })
  ipcMain.handle('node-maintenance:command', async (event, ...args: unknown[]) => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== localUrl) return { ok: false, error: nodeManagementError('forbidden') }
    const [method] = args
    if (args.length === 1 && method === 'ready') {
      rendererReady = true; sendReady()
      return { ok: true, recoveryShortcut, accepted, ready }
    }
    if (args.length === 1 && method === 'openRecoveryLocation') { shell.showItemInFolder(recoveryShortcut); return { ok: true } }
    if (!ready || (!accepted && method !== 'getState' && method !== 'refreshCatalog')) return { ok: false, error: nodeManagementError('busy') }
    if (method === 'removeStandalone') {
      const current = await service.getState()
      const target = current.removal?.target
      if (!target || current.removal?.status !== 'available') return { ok: false, error: nodeManagementError('environment-conflict') }
      const answer = await dialog.showMessageBox(window, {
        type: 'warning', title: '기존 Node.js 제거',
        message: `Node.js ${target.version}를 제거하시겠습니까?`,
        detail: `${target.path}\n\nNode와 npm 사용이 중단됩니다. 프로젝트 작업을 저장하고 실행 중인 Node 작업을 종료해 주세요. 전역 도구와 npm 설정은 필요한 경우 직접 백업하고 재설치해야 합니다. Windows 표준 제거 화면에서 계속하거나 취소할 수 있습니다.`,
        buttons: ['취소', '제거 진행'], defaultId: 0, cancelId: 0,
      })
      if (answer.response !== 1) return { ok: false, error: nodeManagementError('cancelled') }
    }
    const result = await dispatchNodeManagement(service, args, true)
    if (result.ok) lastActiveVersion = result.data.activeSource === 'nvm' ? result.data.activeVersion : null
    return result
  })
  await window.loadURL(localUrl)
  await service.getState()
  ready = true
  window.show()
  sendReady()
}
let lastActiveVersion: string | null = null
if (!app.requestSingleInstanceLock()) app.quit()
else void app.whenReady().then(start).catch(error => {
  dialog.showErrorBox('Node 복구 창 준비 실패', `${error instanceof Error ? error.message : '복구 자산을 확인하지 못했습니다.'}\n기존 Node 제거는 시작하지 않았습니다.`)
  app.quit()
})
