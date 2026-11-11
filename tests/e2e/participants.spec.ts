import {test,expect} from './fixture'
import {settings,sharingState,snapshot} from './sharing-fixture'
import {mkdir} from 'node:fs/promises'
const screens='artifacts/participants/screens'
test.use({fault:'sharing',seed:'single'})
test('participant field errors, deletion and compact reminder rows work in Electron',async({desktop:d})=>{
 const p=d.page;await p.setViewportSize({width:1440,height:960});await mkdir(screens,{recursive:true})
 let dialog=await settings(d);await dialog.getByRole('button',{name:'호스트로 공유'}).click();await dialog.getByLabel('공유할 LAN IP').click();await p.getByRole('option',{name:'127.0.0.1 · 이 PC에서만 사용'}).click();await dialog.getByRole('button',{name:'호스트 주소 저장'}).click()
 const name=dialog.getByLabel('새 참여자 이름'),ip=dialog.getByLabel('새 참여자 IP')
 await ip.fill('192.168.0.999');await dialog.getByRole('button',{name:'등록',exact:true}).click();await expect(name).toBeFocused();await expect(ip).toHaveAttribute('aria-invalid','true')
 await p.screenshot({path:`${screens}/validation.png`})
 await name.fill('디자인 PC');await ip.fill('192.168.0.20');await dialog.getByRole('button',{name:'등록',exact:true}).click();await expect(dialog.getByLabel('디자인 PC IP')).toHaveValue('192.168.0.20')
 const device=(await sharingState(d)).devices[0]
 const before=await snapshot(d)
 await p.evaluate(async({id,deviceId})=>{const r=await window.timelineSharing!.saveProject({id,name:'1.1.1 핫픽스',color:'#2563EB',participants:[{name:'디자인 PC',deviceId}]});if(!r.ok)throw Error(r.error.message)},{id:before.projects[0].id,deviceId:device.id})
 await dialog.locator('.sharing-device-new').scrollIntoViewIfNeeded();await p.screenshot({path:`${screens}/participants.png`})
 const existing=await snapshot(d)
 await dialog.getByRole('button',{name:'디자인 PC 참여자 삭제'}).click();await expect(p.getByRole('alertdialog')).toContainText('1.1.1 핫픽스');await p.getByRole('button',{name:'참여자 삭제',exact:true}).click()
 await expect(dialog.getByLabel('디자인 PC IP')).toHaveCount(0);expect((await sharingState(d)).projects[0].participants).toEqual([]);expect(await snapshot(d)).toEqual(existing)
 await dialog.getByRole('button',{name:'공유 설정 닫기'}).click()
 await p.getByRole('button',{name:'개발 편집',exact:true}).click()
 const start=p.getByRole('switch',{name:'시작일 알림',exact:true}),end=p.getByRole('switch',{name:'종료일 알림',exact:true})
 const a=await start.boundingBox(),b=await end.boundingBox();expect(a?.width).toBe(32);expect(a?.height).toBe(18);expect(b!.y).toBeGreaterThan(a!.y+a!.height);expect(b!.x).toBe(a!.x)
 await start.focus();await p.keyboard.press('Space');await expect(start).toBeChecked()
 await p.screenshot({path:`${screens}/reminders.png`});await p.getByRole('button',{name:'저장',exact:true}).click();await expect(p.locator('.saving-shield')).toHaveCount(0)
 await p.getByRole('button',{name:'개발 알림 설정',exact:true}).click();const quick=p.getByRole('dialog',{name:'알림 설정',exact:true});expect((await quick.getByRole('switch',{name:'시작일 알림',exact:true}).boundingBox())?.width).toBe(32);await p.screenshot({path:`${screens}/quick-reminders.png`})
})
