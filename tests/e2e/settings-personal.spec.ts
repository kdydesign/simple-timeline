import {test,expect} from './fixture'
import {settings,sharingState} from './sharing-fixture'
import {mkdir} from 'node:fs/promises'
test.use({seed:'single',fault:'help-capture'})
test('titlebar settings retain drafts and privately combine holidays with common dates',async({desktop:d},info)=>{
 const p=d.page;await p.setViewportSize({width:1440,height:1100})
 await p.getByRole('button',{name:'설정',exact:true}).click();const dialog=p.getByRole('dialog',{name:'설정',exact:true})
 await expect(dialog.getByRole('tab',{name:'기본 설정'})).toHaveAttribute('aria-selected','true')
 const personal=dialog.getByRole('region',{name:'휴일 관리 (개인)'})
 const saturday=personal.getByRole('button',{name:'토요일 휴일'}),monday=personal.getByRole('button',{name:'월요일 휴일'})
 await expect(saturday).toHaveAttribute('aria-pressed','true');expect(await saturday.evaluate(e=>getComputedStyle(e).backgroundColor)).not.toBe(await monday.evaluate(e=>getComputedStyle(e).backgroundColor))
 await personal.getByLabel('시작일',{exact:true}).fill('2026-11-25');await personal.getByLabel('종료일',{exact:true}).fill('2026-11-25');await personal.getByLabel('휴일 이름').fill('개인 연차')
 await dialog.getByRole('tab',{name:'공유 설정'}).click();await dialog.getByRole('tab',{name:'기본 설정'}).click();await expect(personal.getByLabel('휴일 이름')).toHaveValue('개인 연차')
 await personal.getByRole('button',{name:'휴일 추가'}).click();await expect(personal.getByRole('button',{name:'개인 연차 휴일 삭제'})).toHaveText('삭제')
 await mkdir('artifacts/help-assets',{recursive:true});await dialog.screenshot({path:'artifacts/help-assets/settings-personal.png'})
 await dialog.getByRole('tab',{name:'공유 설정'}).click();const host=dialog.getByRole('button',{name:'호스트로 공유'}),member=dialog.getByRole('button',{name:'멤버로 연결'});await host.click();expect(await host.evaluate(e=>getComputedStyle(e).backgroundColor)).not.toBe(await member.evaluate(e=>getComputedStyle(e).backgroundColor))
 await dialog.getByLabel('공유할 LAN IP').click();await p.getByRole('option',{name:'192.168.0.10',exact:true}).click();await dialog.getByRole('button',{name:'호스트 주소 저장'}).click();await dialog.getByRole('tab',{name:'기본 설정'}).click()
 const common=dialog.getByRole('region',{name:'휴일 관리 (공통)'});await common.getByLabel('시작일',{exact:true}).fill('2026-11-25');await common.getByLabel('종료일',{exact:true}).fill('2026-11-25');await common.getByLabel('휴일 이름').fill('창립기념일');await common.getByRole('button',{name:'휴일 추가'}).click()
 expect((await sharingState(d)).personalHolidays?.dates[0].name).toBe('개인 연차');expect((await sharingState(d)).holidays?.calendar.dates[0].name).toBe('창립기념일')
 await common.screenshot({path:'artifacts/help-assets/holidays.png'});await dialog.screenshot({path:info.outputPath('host-basic-settings.png')});await dialog.getByRole('button',{name:'설정 닫기'}).click()
 const date=p.getByLabel('선택 날짜',{exact:true});await date.fill('2026-11-23');await date.press('Enter');await p.locator('[data-day="2026-11-25"]').hover();await expect(p.getByRole('tooltip')).toContainText('공통:');await expect(p.getByRole('tooltip')).toContainText('개인:');await p.screenshot({path:info.outputPath('both-holiday-sources.png')})
 await p.locator('[data-focus="schedule-add"]').click();await p.getByLabel('시작일',{exact:true}).fill('2026-11-23');await p.getByLabel('종료일',{exact:true}).fill('2026-11-29');await expect(p.getByText('워킹데이: 4일')).toBeVisible()
 await p.getByRole('button',{name:'편집 닫기',exact:true}).click();await p.getByRole('button',{name:'달력',exact:true}).click();await p.locator('[data-date="2026-11-25"]').hover({position:{x:10,y:10}});await expect(p.getByRole('tooltip')).toContainText('개인 연차');await expect(p.getByRole('tooltip')).toContainText('창립기념일')
})
