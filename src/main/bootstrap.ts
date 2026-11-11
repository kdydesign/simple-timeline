/// <reference types="electron-vite/node" />
import {createSharingService,type SharingTransport} from './sharing/service'
import {registerSharingIpc} from './sharing/ipc'
import type {ProtectedSecrets} from './sharing/secrets'
import {createReminderStore} from './db/reminders'
import {createReminderEngine,type ReminderSender} from './reminders/engine'
import {createNativeReminderSender} from './reminders/native'
import {registerReminderIpc} from './reminders/ipc'
import { app, dialog, powerMonitor } from 'electron'
import icon from '../../resources/icon.png?asset'
import windowsIcon from '../../resources/icon.ico?asset'
import { startupRecorder, rendererStartupProbe, observeStartupRequests } from './startup'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { initializeStorage, type StorageState } from './db/lifecycle'
import { profileDirectory } from './profile'
import { createWindow } from './window'
import { registerTimelineIpc } from './ipc'
import { registerWindowIpc } from './window-ipc'
import { resolveRendererUrl } from './ipc-core'
import { createAbout } from './about'
import { installCloseGuard, type CloseChoice } from './close'
import { createTray, updateSharingTray } from './tray'
import { toPublicError } from './errors'
import type { Result } from '../shared/types'
const desktopIcon = process.platform === 'win32' ? windowsIcon : icon

export interface BootstrapOptions {
  sharingTransport?: Partial<SharingTransport>
  sharingSecrets?: (profile:string)=>Promise<ProtectedSecrets>
  sharingClock?: ()=>number
  reminderSender?: ReminderSender
  reminderClock?: ()=>Date
  profileDir?: string
  rendererUrl?: string
  preloadPath?: string
  notifyBlocked?: (storage: StorageState) => void
  afterDispatch?: (
    method: string,
    result: Result<unknown>,
  ) => Result<unknown> | Promise<Result<unknown>>
  createTray?: typeof createTray
  notifyTrayFailure?: () => void
  confirmClose?: () => Promise<boolean>
  chooseClose?: (canHide: boolean) => Promise<CloseChoice>
}
export async function bootstrap(options: BootstrapOptions = {}) {
  const profile = options.profileDir ?? profileDirectory(app.getPath('appData'))
  try {
    mkdirSync(profile, { recursive: true })
    app.setName('Planrail')
    app.setPath('userData', profile)
  } catch (error) {
    const blocked: StorageState = {
      state: 'blocked',
      error: toPublicError(error),
    }
    if (options.notifyBlocked) options.notifyBlocked(blocked)
    else
      dialog.showErrorBox(
        '앱 데이터 폴더를 준비하지 못했습니다',
        `${blocked.error.message}\n기존 파일은 보존합니다. 경로를 확인하고 앱을 다시 실행해 주세요.\n${profile}`,
      )
    app.exit(1)
    return null
  }
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return null
  }
  const startup = startupRecorder(profile, app.getVersion())
  startup.mark('bootstrap')
  await app.whenReady()
  startup.mark('app-ready')
  if (process.platform === 'win32') app.setAppUserModelId('com.kdydesign.simpletimeline')
  const storage = await initializeStorage(profile)
  startup.mark('storage-' + storage.state)
  const rendererUrl =
    options.rendererUrl ??
    resolveRendererUrl(
      pathToFileURL(join(__dirname, '../renderer/index.html')).href,
      {
        packaged: app.isPackaged,
        development: process.env.NODE_ENV === 'development',
        devUrl: process.env.ELECTRON_RENDERER_URL,
      },
    )
  let stopRequestObservation = () => {}
  const window = createWindow(
    options.preloadPath ?? join(__dirname, '../preload/index.cjs'),
    rendererUrl,
    () => startup.mark('window-shown'),
    desktopIcon,
    { mark: startup.mark, observeRequests: w => { stopRequestObservation = observeStartupRequests(w, startup) } },
  )
  let evaluateReminders = () => {}
  let tray: ReturnType<typeof createTray> | undefined
  let sharingIpc:ReturnType<typeof registerSharingIpc>|undefined
  const sharing=storage.state==='ready'?createSharingService({storage,profile,transport:options.sharingTransport,secrets:options.sharingSecrets,clock:options.sharingClock,changed:state=>{sharingIpc?.changed(state);if(tray)updateSharingTray(tray,state)}}):undefined
  sharingIpc=registerSharingIpc(window,rendererUrl,sharing,()=>evaluateReminders())
  void sharing?.start()
  const unregisterWindow = registerWindowIpc(window, rendererUrl)
  const unregister = registerTimelineIpc(
    window,
    storage.state==='ready'&&sharing?{...storage,repository:sharing.repository}:storage,
    rendererUrl,
    async (method, result) => {
      if(result.ok && !method.startsWith('get')){sharing?.notifyLocalMutation();evaluateReminders()}
      const response = options.afterDispatch ? await options.afterDispatch(method, result) : result
      if (method === 'getSnapshot' && response.ok) startup.mark('snapshot-served')
      return response
    },
  )
  window.webContents.once('did-finish-load', () => {
    startup.mark('renderer-loaded')
    void window.webContents.executeJavaScript(rendererStartupProbe)
      .then(timing => startup.renderer(timing)).catch(() => {}).finally(() => stopRequestObservation())
    // A fixed trusted renderer probe observes the ready UI without expanding the preload API.
    void window.webContents.executeJavaScript(`new Promise(resolve => {
      const deadline = performance.now() + 60000;
      const check = () => {
        if (document.documentElement.dataset.timelinePhase === 'ready') resolve(true);
        else if (performance.now() >= deadline) resolve(false);
        else setTimeout(check, 20);
      }; check();
    })`).then(ready => { if (ready) startup.mark('ui-ready') }).catch(() => {})
  })
  if (storage.state === 'blocked') {
    if (options.notifyBlocked) options.notifyBlocked(storage)
    else
      dialog.showErrorBox(
        '저장소를 열 수 없습니다',
        `${storage.error.message}\n원본을 보존합니다.\n${join(profile, 'data', 'timeline.sqlite3')}`,
      )
  }
  let exiting = false
  const show = () => {
    if (window.isDestroyed()) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  }
  const nativeReminders = createNativeReminderSender(icon)
  let reminderIpc: ReturnType<typeof registerReminderIpc> | undefined
  const reminderEngine = storage.state === 'ready' ? createReminderEngine({
    store:createReminderStore(storage.db),snapshot:()=>storage.repository.getSnapshot(),clock:options.reminderClock,
    send:options.reminderSender ?? nativeReminders.send,
    onClick:id=>{show();reminderIpc?.open(id)},onChange:()=>reminderIpc?.changed(),
  }) : undefined
  const sharedReminderEngine=sharing?createReminderEngine({store:sharing.memberReminderStore,snapshot:sharing.memberSnapshot,clock:options.reminderClock,
    beforeSchedule:()=>sharing.authorizeReminder(),send:options.reminderSender??nativeReminders.send,
    onClick:id=>{show();reminderIpc?.open(id)},onChange:()=>reminderIpc?.changed(),
  }):undefined
  const reminderIssues=()=>{
    const local=reminderEngine?.issues()??{failed:0,unknown:0,storageError:true},shared=sharedReminderEngine?.issues()
    return {failed:local.failed+(shared?.failed??0),unknown:local.unknown+(shared?.unknown??0),storageError:local.storageError||!!shared?.storageError}
  }
  reminderIpc=registerReminderIpc(window,rendererUrl,reminderIssues,async()=>{await Promise.all([reminderEngine?.evaluate(true),sharedReminderEngine?.evaluate(true)])})
  evaluateReminders=()=>{void reminderEngine?.evaluate();void sharedReminderEngine?.evaluate()}
  const reminderTimer=setInterval(evaluateReminders,30000)
  const resume=()=>{void reminderEngine?.evaluate();void sharing?.resume().then(()=>sharedReminderEngine?.evaluate())}
  const suspend=()=>{void sharing?.suspend()}
  powerMonitor.on('resume',resume)
  powerMonitor.on('suspend',suspend)
  evaluateReminders()
  let shutdown:Promise<void>|undefined
  const stopServices=()=>{
    if(!shutdown){
      clearInterval(reminderTimer)
      reminderEngine?.dispose();sharedReminderEngine?.dispose()
      shutdown=(sharing?.dispose()??Promise.resolve()).catch(()=>{/* All handlers are already fenced before storage teardown. */})
    }
    return shutdown
  }
  const showAbout = createAbout(icon)
  const openSharingSettings=()=>{show();sharing?.requestSettings()}
  const requestQuit = () => {
    if (exiting) return
    show()
    requestClose()
  }
  try {
    tray = (options.createTray ?? createTray)(desktopIcon, show, requestQuit, showAbout, openSharingSettings, sharing?.getState())
  } catch {
    if (options.notifyTrayFailure) options.notifyTrayFailure()
    else dialog.showErrorBox('트레이를 만들지 못했습니다', '창 닫기로 앱을 종료할 수 있습니다. 저장하지 않은 입력은 종료 전에 확인합니다.')
  }
  const requestClose = installCloseGuard(
    window,
    options.confirmClose ??
      (async () => {
        const result = await dialog.showMessageBox(window, {
          type: 'question',
          title: '변경 내용을 버리고 종료할까요?',
          message: '저장하지 않은 입력이 사라질 수 있습니다.',
          buttons: ['계속 편집', '변경 버리고 종료'],
          defaultId: 0,
          cancelId: 0,
        })
        return result.response === 1
      }),
    {
      hide: tray ? () => window.hide() : undefined,
      chooseClose: () => options.chooseClose ? options.chooseClose(!!tray) : (async () => {
        const choices: CloseChoice[] = tray ? ['hide', 'quit', 'cancel'] : ['quit', 'cancel']
        const result = await dialog.showMessageBox(window, {
          type: 'question', title: 'Planrail 닫기', message: '어떻게 닫을까요?',
          detail: '트레이에서는 일정 알림과 편집 중인 입력이 유지됩니다. 완전히 종료하면 일정 알림이 제공되지 않습니다.' + (tray ? '' : '\n트레이를 사용할 수 없습니다.'),
          buttons: tray ? ['트레이로 보내기', '완전 종료', '취소'] : ['완전 종료', '취소'],
          defaultId: choices.length - 1, cancelId: choices.length - 1, noLink: true,
        })
        return choices[result.response] ?? 'cancel'
      })(),
      beforeClose: () => { exiting = true;void stopServices() },
      afterClose: () => app.quit(),
    },
  )
  app.on('second-instance', show)
  app.on('before-quit', event => {
    if (exiting) return
    event.preventDefault()
    requestQuit()
  })
  app.on('window-all-closed', () => { if (exiting) app.quit() })
  let shutdownComplete=false,finishingShutdown=false
  app.on('will-quit', event => {
    if(shutdownComplete)return
    event.preventDefault()
    if(finishingShutdown)return
    finishingShutdown=true
    void stopServices().then(()=>{
      powerMonitor.removeListener('resume',resume)
      powerMonitor.removeListener('suspend',suspend)
      nativeReminders.dispose()
      reminderIpc?.dispose();sharingIpc?.dispose()
      tray?.destroy();unregister();unregisterWindow()
      if(storage.state==='ready'&&storage.db.open)storage.db.close()
      shutdownComplete=true;app.quit()
    })
  })
  return { window, storage, profile, sharing, desktop: { show, requestQuit, showAbout, openSharingSettings } }
}
