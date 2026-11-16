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
  await dialog.getByRole('button',{name:'공유 설정 닫기'}).click();await host.app.evaluate(()=>(globalThis as any).showUpdateHost());dialog=await settings(host)
  await expect(dialog.getByRole('button',{name:'배포 중지',exact:true})).toBeEnabled()
  await dialog.locator('.update-distribution').screenshot({path:`${directory}/updates-host.png`})
  await member.app.evaluate((_electron,connection)=>(globalThis as any).setupUpdateMember(connection),connection)
  await member.page.reload();await member.page.getByRole('button',{name:'개발 편집',exact:true}).click();await member.page.getByLabel('일정 이름',{exact:true}).fill('업데이트 전 저장할 입력')
  await member.page.getByRole('button',{name:'UPDATE',exact:true}).click();await expect(member.page.getByText('설치 준비 완료',{exact:true})).toBeVisible()
  await member.page.locator('.update-popover').screenshot({path:`${directory}/updates-member.png`})
  expect(await member.app.evaluate(()=>(globalThis as any).updateTrace)).toEqual([])
 }finally{await member.dispose()}
})
