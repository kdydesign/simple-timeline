import {afterEach,expect,it,vi} from 'vitest'
import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {App} from '../../src/renderer/App'
import type {UpdateApi,UpdateGuardRequest,UpdateState} from '../../src/shared/updates'
import {memoryApi} from './fake-api'
import {hotfix} from '../fixtures/timeline'
import {sharingFixture} from './sharing-fixture'
const available:UpdateState={revision:1,role:'member',phase:'available',version:'0.9.0',totalBytes:100,receivedBytes:0,connected:true,editingBlocked:false,requiresExplicitInstall:false,canDownload:true,canCancel:false,canRetry:false,canInstall:false,error:null,host:null}
function updates(initial:Partial<UpdateState>={}){
 let state={...available,...initial},guard:((r:UpdateGuardRequest)=>boolean|Promise<boolean>)|undefined
 const listeners=new Set<(s:UpdateState)=>void>();const result=async()=>({ok:true as const,data:state})
 const api:UpdateApi={getState:vi.fn(result),download:vi.fn(result),cancel:vi.fn(result),retry:vi.fn(result),install:vi.fn(result),importBundle:vi.fn(result),publish:vi.fn(result),withdraw:vi.fn(result),onChange:fn=>{listeners.add(fn);return()=>{listeners.delete(fn)}},onInstallGuard:fn=>{guard=fn;return()=>{guard=undefined}}}
 window.timelineUpdates=api
 return{api,emit(patch:Partial<UpdateState>){state={...state,...patch,revision:state.revision+1};listeners.forEach(fn=>fn(state))},freeze:()=>guard!({requestId:'nonce',action:'freeze'}),release:()=>guard!({requestId:'nonce',action:'release'})}
}
afterEach(()=>{delete window.timelineUpdates})
it('shows UPDATE only for member releases, disables an offline download, and permits verified offline install',async()=>{
 const f=updates({role:'personal',version:null});render(<App api={memoryApi().api}/>);await screen.findByRole('button',{name:'프로젝트 추가'});expect(screen.queryByRole('button',{name:'UPDATE'})).toBeNull()
 act(()=>f.emit({...available,connected:false,canDownload:false}));expect(await screen.findByRole('button',{name:'UPDATE'})).toBeDisabled()
 act(()=>f.emit({phase:'waiting',requiresExplicitInstall:true,canInstall:true}));await userEvent.click(screen.getByRole('button',{name:'UPDATE'}));await userEvent.click(screen.getByRole('button',{name:'설치 후 재시작'}));expect(f.api.install).toHaveBeenCalledOnce()
 act(()=>f.emit({phase:'idle',version:null,canInstall:false,error:'withdrawn'}));expect(screen.queryByRole('button',{name:'UPDATE'})).toBeNull()
})
it('one UPDATE click starts download; closing or Escape keeps transfer running; cancel and retry are explicit',async()=>{
 const f=updates();let finish!:(r:Awaited<ReturnType<UpdateApi['download']>>)=>void;f.api.download=vi.fn(()=>new Promise<Awaited<ReturnType<UpdateApi["download"]>>>(r=>{finish=r}));render(<App api={memoryApi().api}/>);const button=await screen.findByRole('button',{name:'UPDATE'});fireEvent.click(button);fireEvent.click(button);expect(f.api.download).toHaveBeenCalledOnce()
 act(()=>f.emit({phase:'downloading',receivedBytes:50,canDownload:false,canCancel:true}));await act(async()=>finish({ok:true,data:{...available,revision:1}}));expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow','50')
 await userEvent.click(screen.getByRole('button',{name:'업데이트 진행 닫기'}));expect(f.api.cancel).not.toHaveBeenCalled();await userEvent.click(button);await userEvent.keyboard('{Escape}');expect(f.api.cancel).not.toHaveBeenCalled()
 await userEvent.click(button);await userEvent.click(screen.getByRole('button',{name:'다운로드 취소'}));expect(f.api.cancel).toHaveBeenCalledOnce()
 act(()=>f.emit({phase:'error',error:'network',canCancel:false,canRetry:true}));await userEvent.click(screen.getByRole('button',{name:'다시 시도'}));expect(f.api.retry).toHaveBeenCalledOnce()
})
it('dirty primary draft refuses freeze and survives release; a later clean draft requires explicit install',async()=>{
 const f=updates(),u=userEvent.setup();render(<App api={memoryApi().api}/>);const add=await screen.findByRole('button',{name:'프로젝트 추가'});await waitFor(()=>expect(add).toBeEnabled());await u.click(add);await u.type(screen.getByLabelText('프로젝트 이름'),'보존할 입력')
 let clean=true;await act(async()=>{clean=await f.freeze()});expect(clean).toBe(false);fireEvent.change(screen.getByLabelText('프로젝트 이름'),{target:{value:'버리면 안 됨'}});expect(document.documentElement).toHaveAttribute('data-update-frozen','true')
 await act(async()=>{await f.release()});expect(screen.getByLabelText('프로젝트 이름')).toHaveValue('보존할 입력');act(()=>f.emit({phase:'waiting',canDownload:false,canInstall:true,requiresExplicitInstall:true}));await u.click(screen.getByRole('button',{name:'저장'}));await waitFor(()=>expect(screen.queryByLabelText('프로젝트 이름')).toBeNull());expect(f.api.install).not.toHaveBeenCalled()
 await act(async()=>{clean=await f.freeze()});expect(clean).toBe(true);expect(document.documentElement).toHaveAttribute('data-update-frozen','true');await act(async()=>{await f.release()})
})
it('guards sharing device drafts and quick reminders, and keeps failed-teardown editing blocked',async()=>{
 const f=updates(),s=sharingFixture({role:'host',settingsRequestToken:'settings',devices:[{id:'9',name:'민수',ip:'192.168.0.20',approved:true,revoked:false}]}),u=userEvent.setup();render(<App api={memoryApi(hotfix).api}/>);const dialog=await screen.findByRole('dialog',{name:'공유 설정'});await u.type(within(dialog).getByLabelText('새 참여자 이름'),'초안');let clean=true;await act(async()=>{clean=await f.freeze()});expect(clean).toBe(false);await act(async()=>{await f.release()});expect(within(dialog).getByLabelText('새 참여자 이름')).toHaveValue('초안')
 act(()=>f.emit({editingBlocked:true,phase:'error',error:'shutdown'}));await act(async()=>{await f.release()});expect(document.documentElement).toHaveAttribute('data-update-frozen','true');expect(screen.getByText(/앱을 종료한 뒤 다시 열어/)).toBeVisible();expect(s.api.saveDevice).not.toHaveBeenCalled()
})
it('host import is separate from publish and errors retain the current release',async()=>{
 const f=updates({role:'host',host:{importing:false,currentVersion:'0.8.0',candidateVersion:null,candidateBytes:0,publishing:true,canPublish:false}});sharingFixture({role:'host',settingsRequestToken:'settings'});render(<App api={memoryApi().api}/>);await userEvent.click(await screen.findByRole('button',{name:'업데이트 ZIP 가져오기'}));expect(f.api.importBundle).toHaveBeenCalledOnce();expect(f.api.publish).not.toHaveBeenCalled()
 act(()=>f.emit({host:{importing:false,currentVersion:'0.8.0',candidateVersion:'0.8.0',candidateBytes:1024,publishing:true,canPublish:true}}));await userEvent.click(screen.getByRole('button',{name:'배포 시작'}));expect(f.api.publish).toHaveBeenCalledOnce()
 act(()=>f.emit({error:'invalid-bundle'}));expect(screen.getByText(/ZIP/,{selector:'p[role="alert"]'})).toBeVisible();expect(screen.getByText('현재 배포: 0.8.0')).toBeVisible()
})
it('allows cancellation while the original download IPC is still pending',async()=>{
 const f=updates();let finish!:(r:Awaited<ReturnType<UpdateApi['download']>>)=>void;f.api.download=vi.fn(()=>new Promise<Awaited<ReturnType<UpdateApi['download']>>>(r=>{finish=r}));render(<App api={memoryApi().api}/>);await userEvent.click(await screen.findByRole('button',{name:'UPDATE'}));act(()=>f.emit({phase:'downloading',canDownload:false,canCancel:true}));await userEvent.click(screen.getByRole('button',{name:'다운로드 취소'}));expect(f.api.cancel).toHaveBeenCalledOnce();await act(async()=>finish({ok:true,data:available}))
})
it('waits for accepted save completion and retains freeze after the saving shield drains',async()=>{
 const f=updates(),m=memoryApi(),u=userEvent.setup();let finish!:(r:Awaited<ReturnType<typeof m.api.createProject>>)=>void;const create=m.api.createProject;m.api.createProject=vi.fn(()=>new Promise<Awaited<ReturnType<typeof m.api.createProject>>>(r=>{finish=r}));render(<App api={m.api}/>);const add=await screen.findByRole('button',{name:'프로젝트 추가'});await waitFor(()=>expect(add).toBeEnabled());await u.click(add);await u.type(screen.getByLabelText('프로젝트 이름'),'저장 대기');await u.click(screen.getByRole('button',{name:'저장'}));let settled=false,clean=false,pending!:Promise<void>;act(()=>{pending=Promise.resolve(f.freeze()).then(v=>{clean=v;settled=true})});expect(settled).toBe(false);await act(async()=>{finish(await create({name:'저장 대기',color:'#2563EB',participants:[]}))});await act(async()=>{await pending});expect(clean).toBe(true);await waitFor(()=>expect(document.querySelector('.saving-shield')).toBeNull());expect(document.querySelector('.saving-content')).toHaveAttribute('inert');await act(async()=>{await f.release()})
})
it('defers uncommitted toolbar dates and quick reminder drafts but permits a clean popup',async()=>{
 const f=updates(),u=userEvent.setup();const data=structuredClone(hotfix);data.schedules[0].reminder={start:true,end:false,daysBefore:0,time:'09:00'};render(<App api={memoryApi(data).api}/>);await screen.findByRole('button',{name:'개발 편집'});fireEvent.change(screen.getByLabelText('선택 날짜'),{target:{value:'2026-12-12'}});let clean=true;await act(async()=>{clean=await f.freeze()});expect(clean).toBe(false);await act(async()=>{await f.release()});fireEvent.keyDown(screen.getByLabelText('선택 날짜'),{key:'Enter'});
 await u.click(screen.getByRole('button',{name:'개발 알림 설정'}));await act(async()=>{clean=await f.freeze()});expect(clean).toBe(true);await act(async()=>{await f.release()});await u.click(screen.getByRole('switch',{name:'시작일 알림'}));await act(async()=>{clean=await f.freeze()});expect(clean).toBe(false);await act(async()=>{await f.release()})
})
it('release cancels a pending save guard so its late completion cannot approve installation',async()=>{
 const f=updates(),m=memoryApi(),u=userEvent.setup();let finish!:(r:Awaited<ReturnType<typeof m.api.createProject>>)=>void;const create=m.api.createProject;m.api.createProject=vi.fn(()=>new Promise<Awaited<ReturnType<typeof m.api.createProject>>>(r=>{finish=r}));render(<App api={m.api}/>);const add=await screen.findByRole('button',{name:'프로젝트 추가'});await waitFor(()=>expect(add).toBeEnabled());await u.click(add);await u.type(screen.getByLabelText('프로젝트 이름'),'저장 대기');await u.click(screen.getByRole('button',{name:'저장'}));let pending!:Promise<boolean>;act(()=>{pending=Promise.resolve(f.freeze())});await act(async()=>{await f.release()});await act(async()=>{finish(await create({name:'저장 대기',color:'#2563EB',participants:[]}))});let clean=true;await act(async()=>{clean=await pending});expect(clean).toBe(false);expect(document.documentElement).toHaveAttribute('data-update-frozen','false')
})

it('ignores a failed initial snapshot arriving after a valid state event',async()=>{
 const f=updates({role:'host',host:{importing:false,currentVersion:null,candidateVersion:null,candidateBytes:0,publishing:false,canPublish:false}});sharingFixture({role:'host',settingsRequestToken:'settings'});const pending:Array<(r:Awaited<ReturnType<UpdateApi['getState']>>)=>void>=[];f.api.getState=vi.fn(()=>new Promise<Awaited<ReturnType<UpdateApi['getState']>>>(resolve=>pending.push(resolve)));render(<App api={memoryApi().api}/>);await screen.findByRole('dialog',{name:'공유 설정'});act(()=>f.emit({}));await act(async()=>{pending.forEach(resolve=>resolve({ok:false,error:{code:'DB_NOT_READY',message:'초기 읽기 실패'}}))});expect(screen.queryByText('초기 읽기 실패')).toBeNull();expect(screen.getByRole('button',{name:'업데이트 ZIP 가져오기'})).toBeEnabled()
})
