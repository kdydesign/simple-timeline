import {test,expect} from './fixture'
import {launchMember,settings,sharingState} from './sharing-fixture'
import {mkdir} from 'node:fs/promises'
const directory='artifacts/help-assets'
test.use({fault:'updates',seed:'single'})
test('captures real update panels without installing the synthetic update',async({desktop:host},info)=>{
 const member=await launchMember(info,'updates');await mkdir(directory,{recursive:true})
 try{
  const connection=await host.app.evaluate(()=>(globalThis as any).setupUpdateHost())
  let dialog=await settings(host);await dialog.getByRole('button',{name:'호스트로 공유'}).click();await dialog.getByLabel('공유할 LAN IP').click();await host.page.getByRole('option',{name:'127.0.0.1 · 이 PC에서만 사용'}).click();await dialog.getByRole('button',{name:'호스트 주소 저장'}).click()
  await expect.poll(async()=>(await sharingState(host)).role).toBe('host')
  await dialog.getByRole('button',{name:'공유 설정 닫기'}).click();await host.app.evaluate(()=>(globalThis as any).showUpdateHost())
  // The replacement owns a fresh revision sequence; reset old view subscriptions.
  await host.page.reload();dialog=await settings(host)
  await expect(dialog.getByRole('button',{name:'배포 중지',exact:true})).toBeEnabled()
  // Reproduce a late bootstrap publisher after the capture service takes over.
  await host.app.evaluate(()=>(globalThis as any).sendBootstrapUpdate())
  await expect(dialog.getByRole('button',{name:'배포 중지',exact:true})).toBeEnabled()
  await dialog.locator('.update-distribution').screenshot({path:`${directory}/updates-host.png`})
  await member.app.evaluate((_electron,connection)=>(globalThis as any).setupUpdateMember(connection),connection)
  await member.page.reload();await expect.poll(()=>member.app.evaluate(()=>(globalThis as any).updateNotifications?.length??0)).toBe(1);await member.app.evaluate(()=>(globalThis as any).clickUpdateNotification());await expect(member.page.getByText('새 버전을 사용할 수 있습니다.',{exact:true})).toBeVisible()
  await member.page.locator('.update-popover').screenshot({path:`${directory}/updates-member.png`})
  expect(await member.app.evaluate(()=>(globalThis as any).updateTrace)).toEqual([])
 }finally{await member.dispose()}
})
