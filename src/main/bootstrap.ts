/// <reference types="electron-vite/node" />
import { UpdateCatalog } from './updates/catalog'
import { createUpdateRoutes, type UpdateRoutes } from './updates/transport'
import { createUpdateService, type UpdateService } from './updates/service'
import { createInstallCoordinator, prepareProductionInstaller } from './updates/installer'
import { registerUpdateIpc } from './updates/ipc'
import { appMutationBarrier } from './ipc-core'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { SharingNetworkError } from './sharing/transport'
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
  changeSender?: ReminderSender
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
  const nativeReminders = createNativeReminderSender(icon)
  let evaluateReminders = () => {}
  let tray: ReturnType<typeof createTray> | undefined
  let updates:UpdateService|undefined,updateRoutes:UpdateRoutes|undefined,uiReady=false
  let refreshUpdates=()=>{}
  let sharingIpc:ReturnType<typeof registerSharingIpc>|undefined
  const sharing=storage.state==='ready'?createSharingService({storage,profile,mutationsBlocked:()=>appMutationBarrier.blocked(),updateChanged:()=>refreshUpdates(),updates:async(req,res,authenticate)=>{if(!updateRoutes)throw new SharingNetworkError('UNAVAILABLE',503);await updateRoutes(req,res,authenticate)},transport:options.sharingTransport,secrets:options.sharingSecrets,clock:options.sharingClock,changeSender:options.changeSender??nativeReminders.send,onChangeClick:show,changed:state=>{sharingIpc?.changed(state);if(tray)updateSharingTray(tray,state)}}):undefined
  sharingIpc=registerSharingIpc(window,rendererUrl,sharing,()=>evaluateReminders())
  void sharing?.start()
  const updatesIpc=registerUpdateIpc(window,rendererUrl,()=>updates)
  const localAppData=process.env.LOCALAPPDATA??join(homedir(),'AppData','Local')
  const updateRoot=options.profileDir||process.platform!=='win32'?join(profile,'updates'):join(localAppData,'Planrail','updates')
  let catalogPromise:Promise<UpdateCatalog>|undefined
  const catalog=()=>catalogPromise??=(async()=>{
    if(!sharing)throw Error('Sharing unavailable')
    const metadata=JSON.parse(await readFile(join(app.getAppPath(),'package.json'),'utf8'))
    const result=await UpdateCatalog.open({root:updateRoot,hostId:sharing.getUpdateHostId(),hostVersion:app.getVersion(),hostSourceSha:metadata.sourceSha})
    updateRoutes=createUpdateRoutes(result);return result
  })().catch(error=>{catalogPromise=undefined;throw error})
  const coordinator=createInstallCoordinator({barrier:appMutationBarrier,prepare:prepareProductionInstaller,
    freezeRenderer:()=>updatesIpc.guard.freeze(),releaseRenderer:()=>updatesIpc.guard.release(),
    record:async(input,files)=>{if(!updates)throw Error('Updates unavailable');await updates.recordAttempt(input,files)},
    shutdown:async()=>{await stopServices();await finishShutdown();exiting=true;shutdownComplete=true},
  })
  // Rehash/catalog I/O never delays window creation, initial snapshot, or sharing startup.
  if(storage.state==='ready')void createUpdateService({root:join(updateRoot,'member'),version:app.getVersion(),catalog,
    updaterCacheRoot:join(localAppData,'simple-timeline-updater'),editingBlocked:()=>appMutationBarrier.blocked(),
    chooseBundle:async()=>{const choice=await dialog.showOpenDialog(window,{title:'업데이트 ZIP 등록',properties:['openFile'],filters:[{name:'Planrail update ZIP',extensions:['zip']}]});return choice.canceled?undefined:choice.filePaths[0]},
    install:input=>coordinator.install(input),changed:state=>updatesIpc.changed(state),
  }).then(async service=>{
    if(exiting||window.isDestroyed()){await service.dispose();return}
    updates=service
    refreshUpdates=()=>{if(sharing&&!exiting)void service.setSharing(sharing.getUpdateContext()).catch(()=>{})}
    refreshUpdates();updatesIpc.changed(service.getState())
    if(uiReady)await service.confirmHealthyStartup()
  }).catch(()=>{/* Storage initialization failure is exposed by unavailable update IPC; existing app data remains usable. */})
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
    })`).then(ready => { if (ready) { startup.mark('ui-ready');uiReady=true;if(storage.state==='ready')void updates?.confirmHealthyStartup() } }).catch(() => {})
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
  function show() {
    if (window.isDestroyed()) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  }
  let reminderIpc: ReturnType<typeof registerReminderIpc> | undefined
  const reminderEngine = storage.state === 'ready' ? createReminderEngine({
    store:createReminderStore(storage.db),snapshot:()=>storage.repository.getSnapshot(),clock:options.reminderClock,
    send:options.reminderSender ?? nativeReminders.send,
    onClick:id=>{if(appMutationBarrier.blocked())return;show();reminderIpc?.open(id)},onChange:()=>reminderIpc?.changed(),
  }) : undefined
  const sharedReminderEngine=sharing?createReminderEngine({store:sharing.memberReminderStore,snapshot:sharing.memberSnapshot,clock:options.reminderClock,
    beforeSchedule:()=>sharing.authorizeReminder(),send:options.reminderSender??nativeReminders.send,
    onClick:id=>{if(appMutationBarrier.blocked())return;show();reminderIpc?.open(id)},onChange:()=>reminderIpc?.changed(),
  }):undefined
  const reminderIssues=()=>{
    const local=reminderEngine?.issues()??{failed:0,unknown:0,storageError:true},shared=sharedReminderEngine?.issues()
    return {failed:local.failed+(shared?.failed??0),unknown:local.unknown+(shared?.unknown??0),storageError:local.storageError||!!shared?.storageError}
  }
  reminderIpc=registerReminderIpc(window,rendererUrl,reminderIssues,async()=>{await Promise.all([reminderEngine?.evaluate(true),sharedReminderEngine?.evaluate(true)])})
  evaluateReminders=()=>{if(appMutationBarrier.blocked())return;void reminderEngine?.evaluate();void sharedReminderEngine?.evaluate()}
  const reminderTimer=setInterval(evaluateReminders,30000)
  const resume=()=>{if(appMutationBarrier.blocked())return;void reminderEngine?.evaluate();void sharing?.resume().then(()=>sharedReminderEngine?.evaluate())}
  const suspend=()=>{if(appMutationBarrier.blocked())return;void sharing?.suspend()}
  powerMonitor.on('resume',resume)
  powerMonitor.on('suspend',suspend)
  evaluateReminders()
  let shutdown:Promise<void>|undefined
  const stopServices=()=>{
    if(!shutdown){
      clearInterval(reminderTimer)
      shutdown=Promise.all([reminderEngine?.dispose(),sharedReminderEngine?.dispose(),sharing?.dispose()]).then(()=>{})
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
      allowClose:()=>shutdownComplete,
      hide: tray ? () => window.hide() : undefined,
      chooseClose: tray ? undefined : () => options.chooseClose ? options.chooseClose(!!tray) : (async () => {
        const choices: CloseChoice[] = ['quit', 'cancel']
        const result = await dialog.showMessageBox(window, {
          type: 'question', title: 'Planrail 닫기', message: '어떻게 닫을까요?',
          detail: '트레이에서는 일정 알림과 편집 중인 입력이 유지됩니다. 완전히 종료하면 일정 알림이 제공되지 않습니다.' + (tray ? '' : '\n트레이를 사용할 수 없습니다.'),
          buttons: ['완전 종료', '취소'],
          defaultId: choices.length - 1, cancelId: choices.length - 1, noLink: true,
        })
        return choices[result.response] ?? 'cancel'
      })(),
      beforeClose: () => { exiting = true;void updates?.dispose();void stopServices().catch(()=>{}) },
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
  async function finishShutdown(){
    powerMonitor.removeListener('resume',resume);powerMonitor.removeListener('suspend',suspend)
    nativeReminders.dispose()
    if(storage.state==='ready'&&storage.db.open)storage.db.close()
    reminderIpc?.dispose();sharingIpc?.dispose();tray?.destroy();unregister()
  }
  app.on('will-quit', event => {
    if(shutdownComplete)return
    event.preventDefault()
    if(finishingShutdown)return
    finishingShutdown=true
    void stopServices().then(finishShutdown).then(()=>{shutdownComplete=true;updatesIpc.dispose();unregisterWindow();app.quit()}).catch(()=>{
      finishingShutdown=false
      dialog.showErrorBox('앱 종료를 완료하지 못했습니다','저장소 정리가 완료되지 않아 업데이트 설치를 중단했습니다. 앱을 다시 종료한 뒤 실행해 주세요.')
    })
  })
  return { window, storage, profile, sharing, desktop: { show, requestQuit, showAbout, openSharingSettings } }
}
