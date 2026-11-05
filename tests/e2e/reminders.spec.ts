import {test,expect} from './fixture'
test.use({seed:'hotfix',fault:'reminder-test'})
test('real bridge persists reminders, handles click while dirty and suppresses resend after restart',async({desktop})=>{
 const {page:p,app}=desktop
 await p.setViewportSize({width:1280,height:820})
 await p.getByRole('button',{name:'개발 편집',exact:true}).first().click()
 await expect(p.getByLabel('시작일 알림',{exact:true})).not.toBeChecked()
 await p.getByLabel('시작일 알림',{exact:true}).check()
 await p.getByRole('button',{name:'저장',exact:true}).click()
 await expect.poll(()=>app.evaluate(()=>((globalThis as any).reminderMessages??[]).length)).toBe(1)
 expect(await app.evaluate(()=>(globalThis as any).reminderMessages[0].body)).toContain('2일 후 시작')
 await p.getByRole('button',{name:'프로젝트 추가',exact:true}).click();await p.getByLabel('프로젝트 이름',{exact:true}).fill('보존할 초안')
 await app.evaluate(()=>(globalThis as any).reminderClick())
 await expect(p.getByRole('alertdialog')).toBeVisible();await p.getByRole('button',{name:'계속 편집',exact:true}).click()
 await expect(p.getByLabel('프로젝트 이름',{exact:true})).toHaveValue('보존할 초안')
 await p.getByRole('button',{name:'편집 닫기',exact:true}).click();await p.getByRole('button',{name:'변경 버리기',exact:true}).click()
 await app.evaluate(()=>(globalThis as any).reminderClick())
 await expect(p.getByLabel('일정 이름',{exact:true})).toHaveValue('개발');await expect(p.getByLabel('시작일 알림',{exact:true})).toBeChecked()
 await desktop.restart()
 await expect.poll(()=>desktop.app.evaluate(()=>((globalThis as any).reminderMessages??[]).length)).toBe(0)
 const snapshot=await desktop.page.evaluate(()=>window.simpleTimeline.getSnapshot());expect(snapshot.ok&&snapshot.data.schedules[0].reminder.start).toBe(true)
})
test('renderer exposes only reminder capabilities, rejects arbitrary commands and malformed acknowledgements',async({desktop:{page:p,app}})=>{
 expect(await p.evaluate(()=>Object.keys(window.timelineReminders!).sort())).toEqual(['acknowledge','getState','onChange','retry'])
 await expect.poll(()=>app.evaluate(async({ipcMain,BrowserWindow})=>{
  const handler=(ipcMain as any)._invokeHandlers.get('reminder:command');const w=BrowserWindow.getAllWindows()[0]
  const trusted={sender:w.webContents,senderFrame:w.webContents.mainFrame}
  const a=await handler(trusted,'show',{title:'not allowed'}),b=await handler(trusted,'acknowledge',-1),c=await handler({sender:null,senderFrame:null},'getState')
  return [a.error.code,b.error.code,c.error.code]
 })).toEqual(['VALIDATION_ERROR','VALIDATION_ERROR','FORBIDDEN'])
})
