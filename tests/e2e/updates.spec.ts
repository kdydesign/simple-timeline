import {test,expect} from './fixture'
import {launchMember} from './sharing-fixture'
test.use({fault:'updates',seed:'single'})
test('real update IPC across two pinned TLS profiles discards dirty edits and restores failed-install waits',async({desktop:host},info)=>{
 const member=await launchMember(info,'updates')
 try{
  const connection=await host.app.evaluate(()=> (globalThis as any).setupUpdateHost())
  await member.app.evaluate((_electron,connection)=>(globalThis as any).setupUpdateMember(connection),connection)
  await member.page.reload()
  await expect.poll(()=>member.app.evaluate(()=>(globalThis as any).updateNotifications?.length??0)).toBe(1)
  await member.app.evaluate(()=>(globalThis as any).clickUpdateNotification())
  await expect(member.page.getByRole('group',{name:'앱 업데이트'})).toBeVisible()
  expect(await member.app.evaluate(()=>(globalThis as any).updateTrace)).toEqual([])
  await expect(member.page.getByText('새 버전을 사용할 수 있습니다.',{exact:true})).toBeVisible()
  await member.page.getByRole('button',{name:'업데이트 진행 닫기'}).click()
  await member.app.evaluate(()=>new Promise<void>((resolve,reject)=>setImmediate(()=>{try{(globalThis as any).testStorage.db.exec("CREATE TRIGGER update_notice_failure BEFORE INSERT ON update_notification_deliveries BEGIN SELECT RAISE(ABORT,'test notification write'); END");resolve()}catch(e){reject(e)}})))
  await member.app.evaluate(()=>(globalThis as any).checkUpdate())
  await expect(member.page.locator('.update-notification-error')).toBeVisible()
  await member.app.evaluate(()=>new Promise<void>((resolve,reject)=>setImmediate(()=>{try{(globalThis as any).testStorage.db.exec('DROP TRIGGER update_notice_failure');resolve()}catch(e){reject(e)}})))
  await member.app.evaluate(()=>(globalThis as any).checkUpdate())
  await expect(member.page.locator('.update-notification-error')).toHaveCount(0)
  await member.page.getByRole('button',{name:'개발 편집',exact:true}).click();await member.page.getByLabel('일정 이름',{exact:true}).fill('업데이트 중 보존')
  await member.page.getByRole('button',{name:'UPDATE',exact:true}).click()
  // Unsaved text no longer delays installation; no save command is issued.
  // The blocked banner appears before durable attempt recording/shutdown finishes.
  // Hold that actual record step to make a slow Windows disk deterministic.
  await member.app.evaluate(()=>(globalThis as any).waitForUpdateRecord())
  await expect(member.page.getByText(/앱을 종료한 뒤 다시 열어/)).toBeVisible()
  expect(await member.app.evaluate(()=>(globalThis as any).updateTrace)).toEqual([])
  const settled=await member.app.evaluate(()=>(globalThis as any).finishUpdateRecord())
  expect(settled).toMatchObject({phase:'waiting',error:'shutdown',editingBlocked:true})
  await expect(member.page.getByText('업데이트를 위한 앱 종료를 완료하지 못했습니다.',{exact:true})).toBeVisible()
  expect(await member.app.evaluate(()=>(globalThis as any).updateTrace)).toEqual(['shutdown','handoff-failed'])
  // The injected failed handoff has already closed its isolated DB. End that test-only process before relaunching.
  await member.app.evaluate(({app})=>app.exit(0));await member.restart();await member.app.evaluate((_electron,connection)=>(globalThis as any).setupUpdateMember(connection),connection);await member.page.reload()
  await member.page.getByRole('button',{name:'UPDATE',exact:true}).click();await expect(member.page.getByRole('button',{name:'설치 후 재시작'})).toBeEnabled();expect(await member.app.evaluate(()=>(globalThis as any).updateNotifications?.length??0)).toBe(0)
  await expect(member.page.getByText(/설치를 완료하지 못했습니다/)).toBeVisible()
  await expect(member.page.getByRole('button',{name:'개발 편집',exact:true})).toBeVisible()
  expect(await member.app.evaluate(()=>(globalThis as any).updateTrace)).toEqual([])
  await host.app.evaluate(()=>(globalThis as any).withdrawUpdate());await member.app.evaluate(()=>(globalThis as any).checkUpdate())
  await expect(member.page.getByRole('button',{name:'UPDATE',exact:true})).toHaveCount(0)
 }finally{await member.dispose()}
})
