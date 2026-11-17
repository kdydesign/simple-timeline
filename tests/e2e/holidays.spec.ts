import {test,expect} from './fixture'
import {settings,sharingState} from './sharing-fixture'
test.use({seed:'single',fault:'help-capture'})
test('host edits common holidays and both views reflect named dates and changed recurring weekdays',async({desktop:d},info)=>{
 const p=d.page;await p.setViewportSize({width:1440,height:960})
 const dialog=await settings(d);await dialog.getByRole('button',{name:'호스트로 공유'}).click();await dialog.getByLabel('공유할 LAN IP').click();await p.getByRole('option',{name:'192.168.0.10',exact:true}).click();await dialog.getByRole('button',{name:'호스트 주소 저장'}).click()
 const holidays=dialog.getByRole('region',{name:'휴일 관리'})
 await holidays.getByRole('button',{name:'토요일 휴일'}).click();await holidays.getByRole('button',{name:'수요일 휴일'}).click();await holidays.getByRole('button',{name:'반복 요일 저장'}).click()
 await holidays.getByLabel('휴일 날짜',{exact:true}).fill('2026-11-20');await holidays.getByLabel('휴일 이름').fill('창립기념일');await holidays.getByRole('button',{name:'휴일 추가'}).click()
 await expect(holidays.getByRole('cell',{name:'창립기념일',exact:true})).toBeVisible();await holidays.screenshot({path:info.outputPath('holiday-settings.png')})
 expect((await sharingState(d)).holidays?.calendar).toEqual({weekdays:[0,3],dates:[{date:'2026-11-20',name:'창립기념일'}]})
 await dialog.getByRole('button',{name:'공유 설정 닫기'}).click();const date=p.getByLabel('선택 날짜',{exact:true});await date.fill('2026-11-10');await date.press('Enter')
 await expect(p.locator('[data-day="2026-11-20"]')).toHaveClass(/nonworking-day/);await expect(p.locator('[data-day="2026-11-21"]')).not.toHaveClass(/nonworking-day/)
 await p.locator('[data-day="2026-11-20"]').hover();await expect(p.locator('.gantt-holiday-name')).toContainText('창립기념일');await p.screenshot({path:info.outputPath('holidays-gantt.png')})
 await p.getByRole('button',{name:'달력',exact:true}).click();await expect(p.locator('[data-date="2026-11-20"]')).toHaveClass(/nonworking-day/);await expect(p.locator('[data-date="2026-11-21"]')).not.toHaveClass(/nonworking-day/)
 await expect(p.getByText('창립기념일',{exact:true})).toBeVisible();await p.screenshot({path:info.outputPath('holidays-calendar.png')})
})
