import {test,expect} from './fixture'
import {settings,sharingState} from './sharing-fixture'
import {mkdir,writeFile,readFile} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
const directory='artifacts/help-assets'
test.use({seed:'single',fault:'help-capture'})
test('captures current app help illustrations with synthetic participant data only',async({desktop:d})=>{
 const p=d.page;await p.setViewportSize({width:1440,height:960});await mkdir(directory,{recursive:true})
 const dialog=await settings(d);await dialog.getByRole('button',{name:'호스트로 공유'}).click();await dialog.getByLabel('공유할 LAN IP').click();await p.getByRole('option',{name:'192.168.0.10',exact:true}).click();await dialog.getByRole('button',{name:'호스트 주소 저장'}).click()
 await expect(dialog.getByRole('button',{name:'공유 시작',exact:true})).toBeVisible();await dialog.locator('fieldset').screenshot({path:`${directory}/host-address.png`})
 await dialog.getByLabel('새 참여자 이름').fill('디자인 PC');await dialog.getByLabel('새 참여자 IP').fill('192.168.0.20');await dialog.getByRole('button',{name:'등록',exact:true}).click()
 const section=dialog.locator('section').filter({has:p.getByRole('heading',{name:'참여자 이름 · IP'})});await section.scrollIntoViewIfNeeded();await section.screenshot({path:`${directory}/participants.png`})
 await dialog.getByRole('button',{name:'공유 설정 닫기'}).click();await p.getByRole('button',{name:'1.1.1 핫픽스 편집',exact:true}).click()
 await p.getByRole('switch',{name:'공유 프로젝트로 저장'}).click()
 await p.getByRole('button',{name:'참여자 2 삭제'}).click();await p.getByLabel('참여자 1',{exact:true}).fill('디자인 PC');await p.getByRole('combobox',{name:'디자인 PC PC'}).click();await p.getByRole('option',{name:'디자인 PC · 192.168.0.20'}).click();await expect(p.locator('.recipient-field')).toBeVisible()
 const editor=await p.locator('.editor').boundingBox(),actions=await p.locator('.editor-actions').boundingBox();await p.screenshot({path:`${directory}/project-share.png`,clip:{x:editor!.x,y:editor!.y,width:editor!.width,height:actions!.y+actions!.height-editor!.y+20}})
 await p.getByRole('button',{name:'취소',exact:true}).click();await expect(p.getByRole('alertdialog')).toHaveCount(0)
 await p.getByRole('button',{name:'개발 편집',exact:true}).click();await p.getByRole('switch',{name:'시작일 알림',exact:true}).click()
 await p.locator('.reminder-fields').screenshot({path:`${directory}/reminders.png`})
 await writeFile(`${directory}/capture.json`,JSON.stringify({source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),version:JSON.parse(await readFile('package.json','utf8')).version,runtimeVersion:await d.app.evaluate(({app})=>app.getVersion()),platform:process.platform,recordedAt:new Date().toISOString(),command:'tests/e2e/help-assets.spec.ts',synthetic:true,scope:'Actual renderer with isolated SQLite fixture; only participant section, editor and reminder fields captured. Network addresses above section excluded.'},null,2))
 expect((await sharingState(d)).devices[0].name).toBe('디자인 PC')
})
test('captures member address form using example LAN address without connecting',async({desktop:d})=>{
 const panel=await settings(d);await panel.getByRole('button',{name:'멤버로 연결'}).click();await panel.getByLabel('호스트 IP').fill('192.168.0.10')
 await mkdir(directory,{recursive:true});await panel.locator('form').screenshot({path:`${directory}/member-address.png`})
})
test('captures core feature illustrations from the live renderer with synthetic schedule data',async({desktop:d})=>{
 const p=d.page;await p.setViewportSize({width:1440,height:960});await mkdir(directory,{recursive:true});
 const date=p.getByLabel('선택 날짜',{exact:true});await date.fill('2026-11-10');await date.press('Enter');
 await p.screenshot({path:`${directory}/app-overview.png`});
 await p.getByRole('button',{name:'프로젝트 추가',exact:true}).click();await p.getByLabel('프로젝트 이름',{exact:true}).fill('신규 제품 계획');await p.locator('.editor').screenshot({path:`${directory}/project-editor.png`});await p.getByRole('button',{name:'편집 닫기',exact:true}).click();
 await p.locator('[data-focus="schedule-add"]').click();await p.getByLabel('일정 이름',{exact:true}).fill('사용성 검토');await p.locator('.editor').screenshot({path:`${directory}/schedule-editor.png`});await p.getByRole('button',{name:'편집 닫기',exact:true}).click();
 await p.setViewportSize({width:1440,height:1400});await p.getByRole('button',{name:'달력',exact:true}).click();await p.locator('.calendar').screenshot({path:`${directory}/calendar.png`});
 const metadata=JSON.parse(await readFile(`${directory}/capture.json`,'utf8'));metadata.scope+=' Core feature screenshots from the live isolated renderer: toolbar/Gantt, project/schedule editors and calendar; synthetic names only.';await writeFile(`${directory}/capture.json`,JSON.stringify(metadata,null,2));
})
