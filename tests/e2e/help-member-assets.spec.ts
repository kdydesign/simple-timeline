import {test,expect} from './fixture'
import {launchMember,settings,sharingState} from './sharing-fixture'
import {createServer} from 'node:net'
import {mkdir,readFile} from 'node:fs/promises'
test.use({fault:'sharing',seed:'single'})
test('captures authenticated member toolbar without network addresses or credentials',async({desktop:host},info)=>{
 const server=createServer();await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const port=(server.address() as {port:number}).port;await new Promise<void>(r=>server.close(()=>r()))
 const member=await launchMember(info)
 try{
  const h=await settings(host);await h.getByRole('button',{name:'호스트로 공유'}).click();await h.getByLabel('공유할 LAN IP').click();await host.page.getByRole('option',{name:'127.0.0.1 · 이 PC에서만 사용'}).click();await h.getByLabel('포트',{exact:true}).fill(String(port));await h.getByRole('button',{name:'호스트 주소 저장'}).click();await h.getByRole('button',{name:'공유 시작',exact:true}).click()
  await h.getByLabel('새 참여자 이름').fill('디자인 PC');await h.getByLabel('새 참여자 IP').fill('127.0.0.2');await h.getByRole('button',{name:'등록',exact:true}).click()
  const m=await settings(member);await m.getByRole('button',{name:'멤버로 연결'}).click();await m.getByLabel('호스트 IP').fill('127.0.0.1');await m.getByLabel('포트',{exact:true}).fill(String(port));await m.getByRole('button',{name:'연결',exact:true}).click()
  await expect.poll(async()=>(await sharingState(host)).pendingPairs.length).toBe(1)
  const pair=(await sharingState(member)).pendingPair!;expect((await sharingState(host)).pendingPairs[0].fingerprint).toBe(pair.fingerprint)
  await m.getByRole('button',{name:'전체 지문 일치 확인'}).click();await h.getByRole('button',{name:'지문 확인 · 연결 승인'}).click();await host.page.getByRole('button',{name:'일치 확인 후 승인'}).click()
  // Pair credential activation and the following snapshot are separate 2s poll turns.
  // Wait for the approval handshake first; the normal connected-state deadline remains 7s.
  await expect.poll(async()=>(await sharingState(member)).pendingPair,{timeout:15000,message:'first-pair credential activation completes before snapshot capture'}).toBeNull()
  await expect.poll(async()=>(await sharingState(member)).status).toBe('connected');await m.getByRole('button',{name:'설정 닫기'}).click();await member.page.setViewportSize({width:1440,height:960})
  const runtime=JSON.parse(await readFile('package.json','utf8')).version+'-dev'
  expect((await sharingState(member)).hostVersion).toBe(runtime)
  const toolbar=await member.page.locator('.toolbar').boundingBox();await mkdir('artifacts/help-assets',{recursive:true});await member.page.screenshot({path:'artifacts/help-assets/member-toolbar.png',clip:{x:0,y:0,width:1440,height:Math.ceil(toolbar!.y+toolbar!.height+8)}})
  // The PlanRail entry starts at its first article and keeps the member articles available.
  await member.page.getByRole('button',{name:'도움말',exact:true}).click();await expect.poll(()=>member.app.windows().length).toBe(2);const help=member.app.windows().find(p=>p!==member.page)!
  await expect(help.getByRole('heading',{name:'Planrail 시작하기'})).toBeVisible()
  await help.getByRole('navigation').getByRole('button',{name:'호스트 연결하기',exact:true}).click()
  await expect(help.getByRole('heading',{name:'호스트 연결하기'})).toBeVisible()
 }finally{await member.dispose()}
})
