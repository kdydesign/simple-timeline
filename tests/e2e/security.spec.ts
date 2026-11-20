import { test, expect } from './fixture'
test('renderer has no Node/raw IPC and malformed inputs never reach storage', async ({
  desktop: d,
}) => {
  const shape = await d.page.evaluate(() => ({
    node: typeof (window as unknown as { require: unknown }).require,
    keys: Object.keys(window.simpleTimeline),
    sharingKeys: Object.keys(window.timelineSharing!),
    nodeKeys: Object.keys(window.workrailNodeManagement!),
    postRailKeys: Object.keys(window.postRail!),
  }))
  expect(shape.node).toBe('undefined')
  expect(shape.keys.sort()).toEqual(['getStatus','getSnapshot','createProject','updateProject','deleteProject','createSchedule','updateSchedule','deleteSchedule','updateScheduleReminder'].sort())
  expect(shape.keys).not.toContain('invoke')
  expect(shape.sharingKeys.sort()).toEqual(['switchRole','getDormantData','savePersonalHolidays','saveHolidays','getState','configureHost','setHosting','connect','confirmHost','approve','saveDevice','deleteDevice','revokeDevice','saveProject','saveReminder','sync','disconnect','acknowledgeSettings','setChangeNotifications','retryChangeNotifications','acknowledgeChange','onChange'].sort())
  expect(shape.nodeKeys.sort()).toEqual(['selectEnvironment','startEnvironment','cancelOperation','getState','refreshCatalog','installManager','install','use','removeStandalone','openMaintenance','openManagerFolder','openManagerRelease','onChange'].sort())
  expect(shape.postRailKeys.sort()).toEqual(['read','capability','state','mutate','logout','start','stop','page','detail','onChange'].sort())
  const unconfirmed=await d.page.evaluate(()=>window.timelineSharing!.switchRole({role:'host',confirmed:false} as never))
  expect(unconfirmed).toMatchObject({ok:false,error:{code:'VALIDATION_ERROR'}})
  const sandbox = await d.app.evaluate(({app,BrowserWindow})=>({disabled:app.commandLine.hasSwitch('no-sandbox'),renderer:(BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/index.html'))!.webContents as unknown as {getLastWebPreferences():{sandbox?:boolean}}).getLastWebPreferences().sandbox}))
  expect(sandbox).toEqual({disabled:false,renderer:true})
  const malformedSharing = await d.page.evaluate(()=>window.timelineSharing!.connect({address:'https://example.com',port:47831,token:'forged'} as never))
  expect(malformedSharing).toMatchObject({ok:false,error:{code:'VALIDATION_ERROR'}})
  const publicState=await d.page.evaluate(()=>window.timelineSharing!.getState())
  expect(JSON.stringify(publicState)).not.toMatch(/certificatePin|credentialRef|privateKey|"token"/)
  const invalid = await d.page.evaluate(() =>
    window.simpleTimeline.createProject({
      name: 'P',
      color: '#2563EB',
      participants: [],
      sql: 'DROP',
    } as never),
  )
  expect(invalid).toMatchObject({
    ok: false,
    error: { code: 'VALIDATION_ERROR' },
  })
  expect(
    await d.page.evaluate(() => window.simpleTimeline.getSnapshot()),
  ).toEqual({ ok: true, data: { projects: [], schedules: [] } })
  const child = await d.page.evaluate(() => {
    const frame = document.createElement('iframe')
    document.body.append(frame)
    const child = frame.contentWindow as unknown as { simpleTimeline:unknown;timelineSharing:unknown;workrailNodeManagement:unknown;postRail:unknown }
    return {timeline:typeof child.simpleTimeline,sharing:typeof child.timelineSharing,node:typeof child.workrailNodeManagement,postRail:typeof child.postRail}
  })
  expect(child).toEqual({timeline:'undefined',sharing:'undefined',node:'undefined',postRail:'undefined'})
  const old = d.page.url()
  const attempt = await d.app.evaluate(
    ({ BrowserWindow }) =>
      new Promise<string>((resolve, reject) => {
        const contents = BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/index.html'))!.webContents
        const timer = setTimeout(
          () => reject(Error('Navigation guard event missing')),
          10000,
        )
        contents.once('will-navigate', (_event, url) => {
          clearTimeout(timer)
          resolve(url)
        })
        void contents
          .executeJavaScript("location.assign('https://example.com/')")
          .catch(reject)
      }),
  )
  expect(attempt).toBe('https://example.com/')
  expect(d.page.url()).toBe(old)
})
