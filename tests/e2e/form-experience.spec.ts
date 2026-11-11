import {test,expect} from './fixture'
import {settings} from './sharing-fixture'
import {mkdir} from 'node:fs/promises'
const screens='artifacts/form-experience/screens'
test('project validation and sharing popup keep exact approved geometry and LAN menu focus',async({desktop:d})=>{
 const p=d.page;await p.setViewportSize({width:1440,height:900});await mkdir(screens,{recursive:true});
 await p.getByRole('button',{name:'프로젝트 추가',exact:true}).click();await p.getByLabel('색상 코드').fill('bad');await p.getByRole('button',{name:'저장',exact:true}).click();
 await expect(p.getByLabel('프로젝트 이름')).toBeFocused();await expect(p.getByLabel('색상 코드')).toHaveAttribute('aria-invalid','true');await p.screenshot({path:`${screens}/project-errors.png`});
 await p.getByRole('button',{name:'편집 닫기'}).click();await p.getByRole('button',{name:'변경 버리기'}).click();
 const panel=await settings(d);await expect(panel).toHaveCSS('background-color','rgba(43, 46, 49, 0.3)');await expect(panel).toHaveCSS('backdrop-filter','blur(10px)');await expect(panel).toHaveCSS('padding','15px');await expect(p.locator('.sharing-settings-scroll')).toHaveCSS('padding','10px');await expect(panel).toHaveCSS('max-height','740px');
 await panel.getByRole('button',{name:'호스트로 공유'}).click();const lan=panel.getByRole('combobox',{name:'공유할 LAN IP'});await lan.click();await expect(p.locator('.select-popover')).toHaveCSS('backdrop-filter','blur(10px)');await p.screenshot({path:`${screens}/sharing-lan-menu.png`});await p.keyboard.press('Escape');await expect(lan).toBeFocused();
});
test.describe('pending mutation',()=>{
 test.use({fault:'pending-save'});
 test('blocks content keyboard and pointer while preserving titlebar and confirmed-save focus',async({desktop:{page:p}})=>{
  await p.setViewportSize({width:1440,height:900});await mkdir(screens,{recursive:true});await p.getByRole('button',{name:'프로젝트 추가',exact:true}).click();await p.getByLabel('프로젝트 이름').fill('저장 진행 검증');await p.getByRole('button',{name:'저장',exact:true}).click();
  await expect(p.locator('.saving-shield')).toBeVisible();await expect(p.locator('.saving-content')).toHaveAttribute('inert','');await expect(p.getByRole('button',{name:'최소화'})).toBeEnabled();
  await p.keyboard.type('차단');await p.mouse.click(950,140);await expect(p.locator('#editor-name')).toHaveValue('저장 진행 검증');await p.screenshot({path:`${screens}/saving-pending.png`});
  await expect(p.locator('.saving-shield')).toHaveCount(0);await expect(p.getByRole('button',{name:'저장 진행 검증 편집'})).toBeFocused();
 });
});

test.describe('tray request during pending mutation',()=>{
 test.use({fault:'pending-save'});
 test('opens requested sharing settings only after content saving finishes',async({desktop:d})=>{
  const p=d.page;await p.setViewportSize({width:1440,height:900});await p.getByRole('button',{name:'프로젝트 추가',exact:true}).click();await p.getByLabel('프로젝트 이름').fill('트레이 요청 저장');await p.getByRole('button',{name:'저장',exact:true}).click();await expect(p.locator('.saving-shield')).toBeVisible();
  await d.app.evaluate(()=>(globalThis as any).desktopController.openSharingSettings());
  // Acknowledgement proves the renderer received the request while saving.
  await expect.poll(()=>p.evaluate(async()=>{const r=await window.timelineSharing!.getState();return r.ok?r.data.settingsRequestToken:'unavailable'})).toBeNull();
  await expect(p.locator('.saving-shield')).toBeVisible();await expect(p.getByRole('dialog',{name:'공유 설정'})).toHaveCount(0);await p.keyboard.type('차단');await expect(p.locator('#editor-name')).toHaveValue('트레이 요청 저장');
  const dialog=p.getByRole('dialog',{name:'공유 설정'});await expect(dialog).toBeVisible();await expect(p.locator('.saving-shield')).toHaveCount(0);await expect(dialog.getByRole('button',{name:'호스트로 공유'})).toBeFocused();
  await dialog.getByRole('button',{name:'공유 설정 닫기'}).click();await expect(p.getByRole('button',{name:'프로젝트 추가',exact:true})).toBeFocused();await expect(p.getByRole('button',{name:'트레이 요청 저장 편집'})).toBeEnabled();
 });
});
