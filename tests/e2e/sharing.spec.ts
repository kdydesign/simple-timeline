import {test,expect,type Desktop} from './fixture';
import {launchMember,settings,sharingState,snapshot} from './sharing-fixture';
import {createServer} from 'node:net';
import {writeFile} from 'node:fs/promises';
import {basename} from 'node:path';
import {execFileSync} from 'node:child_process';

// Socket reservation is released before the app explicitly binds this loopback-only endpoint.
async function availablePort() {
 const server=createServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=(server.address() as import('node:net').AddressInfo).port;
 await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));return port;
}
test.use({fault:'sharing',seed:'single'});
test('two isolated Electron profiles pair over pinned TLS, share readonly sources and retain private alarms through restart/revoke',async({desktop:host},info)=>{
 test.setTimeout(120000);
 const member=await launchMember(info),port=await availablePort();
 const captures:unknown[]=[];
 const source={head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),scope:'two-profile-electron-loopback-tls',sourceAddress:'127.0.0.2',vault:'isolated-test-aes'};
 let propagation:unknown;
 async function capture(d:Desktop,name:string) {
  const file=info.outputPath(`${name}.png`);expect(await d.page.locator('html').getAttribute('data-theme')).toBe(name.startsWith('dark-')?'dark':'light');await d.page.screenshot({path:file});
  captures.push({file:basename(file),profile:basename(d.profile),state:await sharingState(d),ui:await d.page.evaluate(()=>({theme:document.documentElement.dataset.theme,width:innerWidth,height:innerHeight})),runtime:await d.app.evaluate(({app})=>({version:app.getVersion(),electron:process.versions.electron,platform:process.platform,sandbox:!process.argv.includes('--no-sandbox')}))});
 }
 try {
  // Same local numeric project/schedule IDs in both real SQLite profiles.
  expect((await snapshot(host)).schedules[0].id).toBe('1');expect((await snapshot(member)).schedules[0].id).toBe('1');
  await member.page.getByRole('button',{name:'1.1.1 핫픽스 편집',exact:true}).click();await member.page.getByLabel('프로젝트 이름',{exact:true}).fill('개인 프로젝트');await member.page.getByRole('button',{name:'저장',exact:true}).click();
  await member.page.getByRole('button',{name:'개발 편집',exact:true}).click();await member.page.getByLabel('일정 이름',{exact:true}).fill('개인 일정');await member.page.getByRole('button',{name:'저장',exact:true}).click();
  let h=await settings(host);await expect(h.getByRole('button',{name:'호스트로 공유'})).toBeFocused();
  await h.getByRole('button',{name:'호스트로 공유'}).click();await h.getByLabel('공유할 LAN IP').click();await host.page.getByRole('option',{name:'127.0.0.1 · 이 PC에서만 사용'}).click();await h.getByLabel('포트',{exact:true}).fill(String(port));await h.getByRole('button',{name:'호스트 주소 저장'}).click();await h.getByRole('button',{name:'공유 시작',exact:true}).click();await expect.poll(async()=>(await sharingState(host)).status).toBe('connected');
  await h.getByLabel('새 참여자 이름').fill('멤버 PC');await h.getByLabel('새 참여자 IP').fill('127.0.0.2');await h.getByRole('button',{name:'등록',exact:true}).click();
  let m=await settings(member);await m.getByRole('button',{name:'멤버로 연결'}).click();await m.getByLabel('호스트 IP').fill('127.0.0.1');await m.getByLabel('포트',{exact:true}).fill(String(port));await m.getByRole('button',{name:'연결',exact:true}).click();
  await expect.poll(async()=>(await sharingState(host)).pendingPairs.length).toBe(1);
  const pair=(await sharingState(member)).pendingPair!;expect(pair.fingerprint).toMatch(/^[A-F0-9]{64}$/);expect((await sharingState(host)).pendingPairs[0]).toMatchObject({fingerprint:pair.fingerprint,ip:'127.0.0.2'});
  await expect(member.page.locator('.sharing-status')).toHaveClass(/unavailable/);await expect(member.page.getByRole('button',{name:'수동 동기화',exact:true,includeHidden:true})).toBeDisabled();
  await expect(h.locator('code')).toHaveText(pair.fingerprint);await expect(m.locator('code')).toHaveText(pair.fingerprint);
  await h.locator('code').scrollIntoViewIfNeeded();await capture(host,'dark-host-before-pair-settings');await capture(member,'dark-member-before-pair-settings');
  for(const d of [host,member]){await d.page.getByRole('button',{name:'공유 설정 닫기'}).click();const panel=await settings(d);if(d===member){await expect(panel.getByLabel('호스트 IP')).toHaveValue('127.0.0.1');await expect(panel.getByLabel('포트',{exact:true})).toHaveValue(String(port))}await panel.locator('code').scrollIntoViewIfNeeded();await capture(d,d===host?'dark-host-pair-settings':'dark-member-pair-settings');await panel.getByRole('button',{name:'공유 설정 닫기'}).click();await settings(d)}
  await m.getByRole('button',{name:'전체 지문 일치 확인'}).click();await h.getByRole('button',{name:'지문 확인 · 연결 승인'}).click();await host.page.getByRole('button',{name:'일치 확인 후 승인'}).click();await expect.poll(async()=>(await sharingState(member)).status).toBe('connected');
  await m.getByRole('button',{name:'공유 설정 닫기'}).click();await h.getByRole('button',{name:'공유 설정 닫기'}).click();
  // Convert original host project without changing numeric source identity.
  await host.page.getByRole('button',{name:'1.1.1 핫픽스 편집',exact:true}).click();await host.page.getByRole('button',{name:'참여자 2 삭제'}).click();await host.page.getByLabel('공유 프로젝트로 저장').check();
  for(const combo of await host.page.getByRole('combobox').all()){await combo.click();await host.page.getByRole('option',{name:'멤버 PC · 127.0.0.2'}).click()}
  await host.page.getByRole('button',{name:'저장',exact:true}).click();await host.page.getByRole('button',{name:'공유로 저장',exact:true}).click();
  await expect(member.page.getByRole('button',{name:'개발 편집',exact:true})).toBeVisible();
  await expect.poll(()=>member.app.evaluate(()=>(globalThis as any).changeMessages?.length??0)).toBe(1);
  expect(await member.app.evaluate(()=>(globalThis as any).changeMessages[0])).toMatchObject({body:'1.1.1 핫픽스 프로젝트가 공유되었습니다.'});
  expect(await host.app.evaluate(()=>(globalThis as any).changeMessages?.length??0)).toBe(0);
  const mixed=await snapshot(member),remote=mixed.schedules.find(s=>s.sharing==='member')!;
  expect(remote.id).not.toBe('1');expect(mixed.schedules.find(s=>s.id==='1')?.name).toBe('개인 일정');
  const sync=member.page.getByRole('button',{name:'수동 동기화',exact:true});expect(await sync.evaluate(el=>el.nextElementSibling?.getAttribute('aria-label'))).toBe('조회 모드');await expect(member.page.locator('.brand .sharing-status')).toHaveClass(/connected/);
  await member.page.getByRole('button',{name:'개발 편집',exact:true}).click();await expect(member.page.getByLabel('일정 이름',{exact:true})).toHaveAttribute('readonly','');await expect(member.page.getByRole('button',{name:'삭제',exact:true})).toHaveCount(0);await member.page.getByLabel('시작일 알림',{exact:true}).check();await member.page.getByRole('button',{name:'저장',exact:true}).click();
  expect((await snapshot(host)).schedules[0].reminder.start).toBe(false);expect((await snapshot(member)).schedules.find(s=>s.id===remote.id)?.reminder.start).toBe(true);expect((await snapshot(member)).schedules.find(s=>s.id==='1')?.reminder.start).toBe(false);
  await host.page.getByRole('button',{name:'개발 편집',exact:true}).click();await host.page.getByLabel('일정 이름',{exact:true}).fill('공유 변경');await host.page.getByRole('button',{name:'저장',exact:true}).click();
  await expect(member.page.getByRole('button',{name:'공유 변경 편집',exact:true})).toBeVisible();
  await expect.poll(()=>member.app.evaluate(()=>(globalThis as any).changeMessages?.length??0)).toBe(2);
  expect(await member.app.evaluate(()=>(globalThis as any).changeMessages[1])).toMatchObject({title:'1.1.1 핫픽스',body:'공유 변경 · 이름 변경'});
  const memberUiObservedAt=Date.now(),sourceCommitAt=await host.app.evaluate(()=>(globalThis as any).lastSourceCommitAt as number);
  propagation={sourceCommitAt,memberUiObservedAt,elapsedMs:memberUiObservedAt-sourceCommitAt,scope:'one normal-poll observation on two local processes; includes UI assertion scheduling'};
  await member.page.getByRole('button',{name:'공유',exact:true}).click();await expect(member.page.getByRole('button',{name:'개인 일정 편집',exact:true})).toHaveCount(0);await member.page.getByRole('button',{name:'전체',exact:true}).click();
  await sync.click();await expect(member.page.getByRole('status',{exact:true})).toContainText('동기화했습니다.');
  expect(await member.app.evaluate(()=>(globalThis as any).changeMessages.length)).toBe(2);
  // Native callback enters the real fixed bridge; a dirty draft must survive cancellation.
  const clickChange = async(index:number) => member.app.evaluate((_electron,index)=>new Promise<void>((resolve,reject)=>{
    setImmediate(()=>{try{(globalThis as any).changeClicks[index]();resolve()}catch(error){reject(error)}});
  }),index);
  // Exercise the modal editor used by a 1024px Windows desktop on every platform.
  await member.page.setViewportSize({width:1024,height:768});
  await member.page.getByRole('button',{name:'달력',exact:true}).click();
  await member.page.getByRole('button',{name:'개인',exact:true}).click();
  await member.page.getByRole('button',{name:'일정 추가',exact:true}).click();
  await member.page.getByLabel('일정 이름',{exact:true}).fill('보존할 초안');
  await clickChange(1);
  await expect(member.page.getByRole('alertdialog')).toBeVisible();
  await member.page.getByRole('button',{name:'계속 편집',exact:true}).click();
  await expect(member.page.getByLabel('일정 이름',{exact:true})).toHaveValue('보존할 초안');
  await clickChange(1);
  await member.page.getByRole('button',{name:'변경 버리기',exact:true}).click();
  await expect(member.page.getByLabel('일정 이름',{exact:true})).toHaveValue('공유 변경');
  await expect(member.page.getByLabel('일정 이름',{exact:true})).toHaveAttribute('readonly','');
  await expect(member.page.getByRole('dialog',{name:'일정 편집'})).toHaveAttribute('aria-modal','true');
  await expect(member.page.getByRole('button',{name:'달력',exact:true})).toHaveCount(0);
  await capture(member,'dark-change-click-readonly-calendar');
  await member.page.getByRole('button',{name:'편집 닫기',exact:true}).click();
  // Narrow editors hide the background toolbar from accessibility until dismissed.
  await expect(member.page.getByRole('button',{name:'달력',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(member.page.getByRole('button',{name:'전체',exact:true})).toHaveAttribute('aria-pressed','true');
  await member.page.getByRole('button',{name:'간트',exact:true}).click();
  // The persisted switch gates OS delivery only; received source data continues updating.
  m=await settings(member);
  const changesSwitch=m.getByRole('switch',{name:'공유 변경 알림',exact:true});
  await expect(changesSwitch).toBeChecked();
  await capture(member,'dark-change-notification-settings');
  // This controlled switch changes only after the durable IPC result, not synchronously on click.
  await changesSwitch.click();await expect(changesSwitch).not.toBeChecked();
  await expect.poll(async()=>(await sharingState(member)).changeNotifications?.enabled).toBe(false);
  await host.page.getByRole('button',{name:'공유 변경 편집',exact:true}).click();
  await host.page.getByLabel('일정 이름',{exact:true}).fill('수신 꺼짐 중 변경');
  await host.page.getByRole('button',{name:'저장',exact:true}).click();
  await expect.poll(async()=>(await snapshot(member)).schedules.find(s=>s.id===remote.id)?.name).toBe('수신 꺼짐 중 변경');
  expect(await member.app.evaluate(()=>(globalThis as any).changeMessages.length)).toBe(2);
  await changesSwitch.click();await expect(changesSwitch).toBeChecked();
  await expect.poll(async()=>(await sharingState(member)).changeNotifications?.enabled).toBe(true);
  await expect.poll(async()=>(await sharingState(member)).changeNotifications?.baselining).toBe(false);
  expect(await member.app.evaluate(()=>(globalThis as any).changeMessages.length)).toBe(2);
  await m.getByRole('button',{name:'공유 설정 닫기'}).click();
  await host.page.getByRole('button',{name:'수신 꺼짐 중 변경 편집',exact:true}).click();
  await host.page.getByLabel('일정 이름',{exact:true}).fill('공유 변경');
  await host.page.getByRole('button',{name:'저장',exact:true}).click();
  await expect.poll(()=>member.app.evaluate(()=>(globalThis as any).changeMessages.length)).toBe(3);
  expect((await snapshot(member)).schedules.find(s=>s.id===remote.id)?.reminder.start).toBe(true);
  await capture(member,'dark-member-before-connected-toolbar');m=await settings(member);await capture(member,'dark-member-before-connected-settings');await m.getByRole('button',{name:'공유 설정 닫기'}).click();
  await capture(member,'dark-member-connected-toolbar');m=await settings(member);await capture(member,'dark-member-connected-settings');
  // Real modal keyboard focus and nested cancellation restore the initiating control.
  await m.getByRole('button',{name:'연결 해제',exact:true}).focus();await member.page.keyboard.press('Enter');await expect(member.page.getByRole('alertdialog')).toBeVisible();await member.page.keyboard.press('Escape');await expect(m.getByRole('button',{name:'연결 해제',exact:true})).toBeFocused();await member.page.keyboard.press('Escape');await expect(m).toHaveCount(0);
  await member.restart();await expect.poll(async()=>(await sharingState(member)).status).toBe('connected');expect((await snapshot(member)).schedules.find(s=>s.id===remote.id)?.reminder.start).toBe(true);
  expect(await member.app.evaluate(()=>(globalThis as any).changeMessages?.length??0)).toBe(0);
  // Stop/start on actual host and member red/green with explicit reconnect.
  h=await settings(host);await h.getByRole('button',{name:'공유 중지',exact:true}).click();await member.page.getByRole('button',{name:'수동 동기화',exact:true}).click();await expect(member.page.locator('.sharing-status')).toHaveClass(/unavailable/);await capture(member,'dark-member-disconnected-toolbar');
  m=await settings(member);await capture(member,'dark-member-disconnected-settings');await m.getByRole('button',{name:'공유 설정 닫기'}).click();await capture(member,'dark-member-before-disconnected-toolbar');m=await settings(member);await capture(member,'dark-member-before-disconnected-settings');
  await h.getByRole('button',{name:'공유 시작',exact:true}).click();await m.getByRole('button',{name:'연결',exact:true}).click();await expect.poll(async()=>(await sharingState(member)).status).toBe('connected');await m.getByRole('button',{name:'공유 설정 닫기'}).click();
  await host.restart();await expect.poll(async()=>(await sharingState(host)).status).toBe('connected');await member.page.getByRole('button',{name:'수동 동기화',exact:true}).click();await expect(member.page.locator('.sharing-status')).toHaveClass(/connected/);
  h=await settings(host);await h.getByRole('button',{name:'승인 취소',exact:true}).click();await host.page.getByRole('alertdialog').getByRole('button',{name:'승인 취소',exact:true}).click();await member.page.getByRole('button',{name:'수동 동기화',exact:true}).click();await expect.poll(async()=>(await sharingState(member)).status).toBe('revoked');await expect.poll(async()=>(await snapshot(member)).schedules.filter(s=>s.sharing==='member').length).toBe(0);expect((await snapshot(member)).schedules[0].name).toBe('개인 일정');
  await expect.poll(()=>member.app.evaluate(()=>(globalThis as any).changeMessages?.length??0)).toBe(1);
  expect(await member.app.evaluate(()=>(globalThis as any).changeMessages[0])).toEqual({title:'공유 변경 알림',body:'공유가 종료되었습니다.'});
  m=await settings(member);await m.getByRole('button',{name:'연결 해제',exact:true}).click();await member.page.getByRole('alertdialog').getByRole('button',{name:'연결 해제',exact:true}).click();await expect.poll(async()=>(await sharingState(member)).role).toBe('personal');expect(await snapshot(member)).toMatchObject({schedules:[{id:'1',name:'개인 일정'}]});
 } finally {await writeFile(info.outputPath('screenshots.json'),JSON.stringify({source,propagation,captures},null,2));await member.dispose()}
});

test('lost v3 sharing metadata shows the preserved-database blocked screen on restart',async({desktop:d})=>{
 await d.app.evaluate(()=>{(globalThis as any).testStorage.db.exec('DELETE FROM sharing_config')});
 await d.restart();
 await expect(d.page.getByRole('button',{name:'프로젝트 추가',exact:true})).toBeDisabled();
 await expect(d.page.getByRole('alert').filter({hasText:'원본을 보존'})).toBeVisible();
 expect(await d.page.evaluate(()=>window.simpleTimeline.getSnapshot())).toMatchObject({ok:false,error:{code:'DB_CORRUPT'}});
 expect(await d.page.evaluate(()=>window.timelineSharing!.getState())).toMatchObject({ok:false});
});
