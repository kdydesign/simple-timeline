import {it,expect,vi,afterEach} from 'vitest'
import {render,screen,waitFor,act,within,renderHook,fireEvent} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {App} from '../../src/renderer/App'
import {useTimeline} from '../../src/renderer/state/useTimeline'
import {memoryApi} from './fake-api'
import {hotfix} from '../fixtures/timeline'
import type {SharingApi,SharingState,SharedProjectInput} from '../../src/shared/sharing'
import {sharedId} from '../../src/domain/sharing'
import {sharingFixture,personalState} from './sharing-fixture'
afterEach(()=>{delete window.timelineSharing})
it('preserves nonhost participants as readonly even without sharing capability',async()=>{
 const u=userEvent.setup(),m=memoryApi(hotfix);render(<App api={m.api}/>);
 await u.click(await screen.findByRole('button',{name:'1.1.1 핫픽스 편집'}));
 expect(screen.getByLabelText('참여자 1')).toHaveAttribute('readonly');
 expect(screen.queryByRole('button',{name:'참여자 이름 추가'})).not.toBeInTheDocument();
 await u.type(screen.getByLabelText('프로젝트 이름'),' 수정');await u.click(screen.getByRole('button',{name:'저장'}));
 await waitFor(()=>expect(m.snapshot.projects[0].name).toContain('수정'));expect(m.snapshot.projects[0].participants).toEqual(hotfix.projects[0].participants);
});
it('places member sync immediately before modes and shows status beside title; shared detail saves only own alarm',async()=>{
 const f=sharingFixture({role:'member',status:'connected',lastCheckedAt:'2026-11-10T08:00:00Z'}),u=userEvent.setup();
 const data=structuredClone(hotfix),p=sharedId('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','1');
 data.projects.push({...data.projects[0],id:p,name:'공유 프로젝트',sharing:'member'});data.schedules.push({...data.schedules[0],id:p,projectId:p,name:'공유 일정',sharing:'member'});
 const m=memoryApi(data);f.api.saveReminder=vi.fn(async({id,reminder})=>{const s=m.snapshot.schedules.find(s=>s.id===id)!;s.reminder=reminder;return{ok:true as const,data:s}});
 render(<App api={m.api}/>);const sync=await screen.findByRole('button',{name:'수동 동기화'});expect(sync.nextElementSibling).toHaveAttribute('aria-label','조회 모드');
 expect(screen.getByRole('button',{name:/공유 연결 상태/}).closest('.brand')).toHaveTextContent('Planrail');
 await u.click(screen.getByRole('button',{name:'공유 일정 편집'}));expect(screen.getByLabelText('일정 이름')).toHaveAttribute('readonly');expect(screen.queryByRole('button',{name:'삭제'})).not.toBeInTheDocument();
 await u.click(screen.getByLabelText('시작일 알림'));await u.click(screen.getByRole('button',{name:'저장'}));await waitFor(()=>expect(f.api.saveReminder).toHaveBeenCalledOnce());
 expect(f.api.saveReminder).toHaveBeenCalledWith(expect.objectContaining({id:p}));
});
it('opens settings from tray request while retaining personal draft; pending cleanup remains retryable in personal role',async()=>{
 const f=sharingFixture(),u=userEvent.setup();await act(async()=>{render(<App api={memoryApi().api}/>)});const add=await screen.findByRole('button',{name:'프로젝트 추가'});await waitFor(()=>expect(add).toBeEnabled());await act(async()=>{fireEvent.click(add)});await act(async()=>{fireEvent.change(screen.getByLabelText('프로젝트 이름'),{target:{value:'보존할 초안'}})});
 await act(async()=>f.emit({settingsRequestToken:'request-1',cleanupPending:true,message:'파일 접근을 확인하고 연결 해제를 다시 시도해 주세요.'}));
 const settings=await screen.findByRole('dialog',{name:'공유 설정'});await u.click(within(settings).getByRole('button',{name:'연결 해제 다시 시도'}));await u.click(screen.getByRole('button',{name:'연결 해제'}));await waitFor(()=>expect(f.api.disconnect).toHaveBeenCalledWith({confirmed:true}));
 await u.click(within(settings).getByRole('button',{name:'공유 설정 닫기'}));expect(screen.getByLabelText('프로젝트 이름')).toHaveValue('보존할 초안');
});
it('background snapshot failure does not block a personal save, and an older refresh cannot overwrite its result',async()=>{
 const m=memoryApi(),{result}=renderHook(()=>useTimeline(m.api));await waitFor(()=>expect(result.current.phase).toBe('ready'));
 const read=m.api.getSnapshot;let release!:(v:Awaited<ReturnType<typeof read>>)=>void;m.api.getSnapshot=()=>new Promise(r=>{release=r});let pending!:Promise<boolean>;
 act(()=>{pending=result.current.reconcile()});m.api.getSnapshot=read;await act(async()=>{await result.current.mutate('createProject',{name:'개인',color:'#2563EB',participants:[]})});
 await act(async()=>{release({ok:true,data:{projects:[],schedules:[]}});await pending});expect(result.current.snapshot?.projects).toHaveLength(1);expect(result.current.phase).toBe('ready');
 m.api.getSnapshot=async()=>({ok:false,error:{code:'STORAGE_IO',message:'공유 조회 실패'}});await act(async()=>{await result.current.reconcile()});expect(result.current.phase).toBe('ready');expect(result.current.error).toBeNull();
});
it('never announces sync success for status failure or failed snapshot application; blocks duplicate sync',async()=>{
 const f=sharingFixture({role:'member',address:'192.168.0.10',status:'disconnected',message:'연결 실패'}),m=memoryApi(),u=userEvent.setup();render(<App api={m.api}/>);
 const sync=await screen.findByRole('button',{name:'수동 동기화'});await waitFor(()=>expect(sync).toBeEnabled());await u.click(sync);expect(screen.getByRole('status')).not.toHaveTextContent('동기화했습니다.');await waitFor(()=>expect(screen.getAllByRole('alert').filter(a=>a.textContent==='연결 실패')).toHaveLength(1));
 f.api.sync=vi.fn(async()=>({ok:true as const,data:{...personalState,role:'member' as const,status:'connected' as const,address:'192.168.0.10'}}));m.api.getSnapshot=async()=>({ok:false,error:{code:'STORAGE_IO',message:'읽기 실패'}});await u.click(sync);await waitFor(()=>expect(screen.getAllByRole('alert').some(a=>a.textContent?.includes('화면에 반영'))).toBe(true));expect(screen.getByRole('button',{name:'프로젝트 추가'})).toBeEnabled();
 m.api.getSnapshot=async()=>({ok:true,data:{projects:[],schedules:[]}});let finish!:()=>void;f.api.sync=vi.fn(()=>new Promise<Awaited<ReturnType<SharingApi["sync"]>>>(resolve=>{finish=()=>resolve({ok:true,data:{...personalState,role:'member' as const,status:'connected' as const,address:'192.168.0.10'}})}));await u.click(sync);expect(sync).toBeDisabled();await act(async()=>finish());await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('동기화했습니다.'));
});
it('filters mixed sources together while preserving dirty input and navigation expansion',async()=>{
 const f=sharingFixture({role:'member'}),u=userEvent.setup(),data=structuredClone(hotfix);data.projects[0].name='개인 원본';const id=sharedId('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','1');data.projects.push({...data.projects[0],id,name:'공유 원본',sharing:'member'});data.schedules.push({...data.schedules[0],id,projectId:id,name:'멀리 있는 공유 일정',startDate:'2030-01-01',endDate:'2030-01-02',sharing:'member'});
 render(<App api={memoryApi(data).api}/>);await screen.findByRole('button',{name:'공유 원본 편집'});await u.click(screen.getByRole('button',{name:'개인'}));expect(document.querySelector('[data-range]')).not.toHaveTextContent('2030-01-31');expect(screen.queryByRole('button',{name:'공유 원본 편집'})).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'개인 원본 편집'})).toBeVisible();
 await u.click(screen.getByRole('button',{name:'개인 원본 편집'}));await u.type(screen.getByLabelText('프로젝트 이름'),' 초안');
 act(()=>f.emit({snapshotRevision:1}));await waitFor(()=>expect(screen.getByLabelText('프로젝트 이름')).toHaveValue('개인 원본 초안'));
 await u.click(screen.getByRole('button',{name:'편집 닫기'}));await u.click(screen.getByRole('button',{name:'변경 버리기'}));await u.click(screen.getByRole('button',{name:'공유'}));expect(screen.queryByRole('button',{name:'개인 원본 편집'})).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'멀리 있는 공유 일정 편집'})).toBeVisible();
 fireEvent.change(screen.getByLabelText('선택 날짜'),{target:{value:'2031-05-10'}});fireEvent.keyDown(screen.getByLabelText('선택 날짜'),{key:'Enter'});expect(document.querySelector('[data-range]')).toHaveTextContent('2031-05-31');await u.click(screen.getByRole('button',{name:'전체'}));expect(document.querySelector('[data-range]')).toHaveTextContent('2031-05-31');await u.click(screen.getByRole('button',{name:'공유'}));await u.click(screen.getByRole('button',{name:'달력'}));await u.click(screen.getByRole('button',{name:'프로젝트 목록'}));expect(within(screen.getByRole('region',{name:'프로젝트 목록'})).queryByRole('button',{name:'개인 원본 편집'})).not.toBeInTheDocument();
});
it('host editor converts an original through explicit participant-IP confirmation and sharing API',async()=>{
 const f=sharingFixture({role:'host',devices:[{id:'9',name:'민수',ip:'192.168.0.20',approved:true,revoked:false}]}),u=userEvent.setup(),m=memoryApi(hotfix);f.api.saveProject=vi.fn(async (input:SharedProjectInput)=>{const p={...m.snapshot.projects[0],...input,participants:input.participants.map(p=>p.name),sharing:'host' as const};m.snapshot.projects[0]=p;return{ok:true as const,data:p}});
 render(<App api={m.api}/>);await u.click(await screen.findByRole('button',{name:'1.1.1 핫픽스 편집'}));await u.click(screen.getByLabelText('공유 프로젝트로 저장'));
 const selects=screen.getAllByRole('combobox');for(const select of selects){await u.click(select);await u.click(screen.getByRole('option',{name:'민수 · 192.168.0.20'}))}
 await u.click(screen.getByRole('button',{name:'저장'}));expect(screen.getByRole('alertdialog')).toHaveTextContent('192.168.0.20');expect(f.api.saveProject).not.toHaveBeenCalled();await u.click(screen.getByRole('button',{name:'공유로 저장'}));await waitFor(()=>expect(f.api.saveProject).toHaveBeenCalledOnce());expect(f.api.saveProject).toHaveBeenCalledWith(expect.objectContaining({id:hotfix.projects[0].id,participants:expect.arrayContaining([expect.objectContaining({deviceId:'9'})])}));
});
it('preserves a dirty member alarm while readonly source fields refresh, then disables save after revocation',async()=>{
 const f=sharingFixture({role:'member',address:'192.168.0.10',status:'connected'}),m=memoryApi(hotfix),u=userEvent.setup();m.snapshot.projects[0].sharing='member';m.snapshot.schedules[0].sharing='member';render(<App api={m.api}/>);await u.click(await screen.findByRole('button',{name:`${hotfix.schedules[0].name} 편집`}));await u.click(screen.getByLabelText('시작일 알림'));
 m.snapshot.schedules[0].name='호스트가 수정한 이름';act(()=>f.emit({snapshotRevision:1}));await waitFor(()=>expect(screen.getByLabelText('일정 이름')).toHaveValue('호스트가 수정한 이름'));expect(screen.getByLabelText('시작일 알림')).toBeChecked();
 m.snapshot.schedules.splice(0);m.snapshot.projects.splice(0);act(()=>f.emit({snapshotRevision:2,status:'revoked'}));await waitFor(()=>expect(screen.getByRole('button',{name:'저장'})).toBeDisabled());expect(screen.getByRole('dialog')).toHaveTextContent('더 이상 공유');
});
it('keeps settings address/device drafts across poll events and protects closing/native exit',async()=>{
 const f=sharingFixture({role:'host',address:'192.168.0.10',settingsRequestToken:'settings',devices:[{id:'9',name:'민수',ip:'192.168.0.20',approved:true,revoked:false}]}),u=userEvent.setup();render(<App api={memoryApi(hotfix).api}/>);const dialog=await screen.findByRole('dialog',{name:'공유 설정'});await u.clear(within(dialog).getByLabelText('민수 IP'));await u.type(within(dialog).getByLabelText('민수 IP'),'192.168.0.21');act(()=>f.emit({lastCheckedAt:'2026-11-10T08:30:00Z'}));expect(within(dialog).getByLabelText('민수 IP')).toHaveValue('192.168.0.21');expect(document.documentElement.dataset.editorDirty).toBe('true');await u.click(within(dialog).getByRole('button',{name:'공유 설정 닫기'}));expect(screen.getByRole('alertdialog')).toHaveTextContent('설정 변경');await u.click(screen.getByRole('button',{name:'취소'}));expect(within(dialog).getByLabelText('민수 IP')).toHaveValue('192.168.0.21');
});
it('displays full host-bound fingerprints without truncation and confirms affected projects on IP changes',async()=>{
 const fingerprint=Array.from({length:32},(_,i)=>i.toString(16).padStart(2,'0')).join(':');const f=sharingFixture({role:'host',settingsRequestToken:'settings',projects:[{id:'1',participants:[{name:'민수',deviceId:'9'}]}],devices:[{id:'9',name:'민수',ip:'192.168.0.20',approved:true,revoked:false}],pendingPairs:[{pairId:'attempt',deviceId:'9',name:'민수',ip:'192.168.0.20',fingerprint,expiresAt:'2026-11-10T09:00:00Z'}]}),u=userEvent.setup();f.api.saveDevice=vi.fn(async (input:{id?:string;name:string;ip:string})=>({ok:true as const,data:{id:'9',name:input.name,ip:input.ip,approved:true,revoked:false}}));render(<App api={memoryApi(hotfix).api}/>);const dialog=await screen.findByRole('dialog',{name:'공유 설정'});expect(within(dialog).getByText(fingerprint)).toHaveTextContent(fingerprint);await u.clear(within(dialog).getByLabelText('민수 IP'));await u.type(within(dialog).getByLabelText('민수 IP'),'192.168.0.21');await u.click(within(dialog).getByRole('button',{name:'수정'}));expect(screen.getByRole('alertdialog')).toHaveTextContent(hotfix.projects[0].name);expect(f.api.saveDevice).not.toHaveBeenCalled();await u.click(screen.getByRole('button',{name:'IP 수정'}));await waitFor(()=>expect(f.api.saveDevice).toHaveBeenCalledWith({id:'9',name:'민수',ip:'192.168.0.21'}));
});
it('refreshes a member project readonly detail when the host changes its name',async()=>{
 const f=sharingFixture({role:'member'}),m=memoryApi(hotfix),u=userEvent.setup();m.snapshot.projects[0].sharing='member';render(<App api={m.api}/>);await u.click(await screen.findByRole('button',{name:'1.1.1 핫픽스 편집'}));m.snapshot.projects[0].name='변경된 공유 이름';act(()=>f.emit({snapshotRevision:1}));await waitFor(()=>expect(screen.getByLabelText('프로젝트 이름')).toHaveValue('변경된 공유 이름'));expect(screen.getByLabelText('프로젝트 이름')).toHaveAttribute('readonly');
});
it('never falls back to source CRUD when a member reminder capability is unavailable',async()=>{
 const m=memoryApi(hotfix),u=userEvent.setup();m.snapshot.projects[0].sharing='member';m.snapshot.schedules[0].sharing='member';const update=vi.spyOn(m.api,'updateSchedule');render(<App api={m.api}/>);await u.click(await screen.findByRole('button',{name:'개발 편집'}));await u.click(screen.getByLabelText('시작일 알림'));await u.click(screen.getByRole('button',{name:'저장'}));expect(update).not.toHaveBeenCalled();expect(screen.getByRole('alert')).toHaveTextContent('공유 알림');
});
it('shows member-intent red status and disabled sync while the first pairing still has personal privileges',async()=>{
 sharingFixture({role:'personal',status:'pairing',pendingPair:{pairId:'attempt',fingerprint:'A'.repeat(64),expiresAt:'2026-11-10T09:00:00Z'}});
 render(<App api={memoryApi().api}/>);
 const sync=await screen.findByRole('button',{name:'수동 동기화'});expect(sync).toBeDisabled();expect(sync.nextElementSibling).toHaveAttribute('aria-label','조회 모드');
 expect(screen.getByRole('button',{name:/공유 연결 상태/})).toHaveClass('unavailable');
 expect(sync).toHaveAccessibleDescription('설정과 연결 승인이 필요합니다.');
});

it('uses an unsaved host-only sharing switch when adding a project',async()=>{
 const f=sharingFixture({role:'host'}),u=userEvent.setup();render(<App api={memoryApi().api}/>);
 const add=await screen.findByRole('button',{name:'프로젝트 추가'});await waitFor(()=>expect(add).toBeEnabled());await u.click(add);
 const toggle=screen.getByRole('switch',{name:'공유 프로젝트로 저장'});
 expect(toggle).not.toBeChecked();await u.click(toggle);expect(toggle).toBeChecked();
 expect(f.api.saveProject).not.toHaveBeenCalled();
});
