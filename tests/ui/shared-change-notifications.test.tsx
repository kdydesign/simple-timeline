import {it,expect,vi,beforeEach} from 'vitest'
import {render,screen,waitFor,act,within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {App} from '../../src/renderer/App'
import {memoryApi} from './fake-api'
import {hotfix} from '../fixtures/timeline'
import {sharingFixture} from './sharing-fixture'
import type {ChangeNotificationState} from '../../src/shared/sharing'
import type {ChangeTarget} from '../../src/shared/change-notifications'
const changeState:ChangeNotificationState={enabled:true,baselining:false,supported:true,failed:0,unknown:0,storageError:false,openRequest:null}
beforeEach(()=>{localStorage.clear();Object.defineProperty(window,'innerWidth',{value:1707,writable:true,configurable:true})})
function member(extra:Partial<ChangeNotificationState>={}){
 const f=sharingFixture({role:'member',address:'192.168.0.10',status:'connected',changeNotifications:{...changeState,...extra}})
 const m=memoryApi(hotfix);m.snapshot.projects[0].sharing='member';m.snapshot.schedules[0].sharing='member'
 let token=0
 const click=(target:ChangeTarget)=>act(async()=>f.emit({changeNotifications:{...changeState,...extra,openRequest:{token:`click-${++token}`,target}}}))
 return {...f,m,click}
}
it('persists the member switch only after success, blocks pending saves and preserves failure value',async()=>{
 const f=member(),u=userEvent.setup();render(<App api={f.m.api}/>);await screen.findByRole('button',{name:'수동 동기화'});await act(async()=>f.emit({settingsRequestToken:'settings'}))
 const dialog=await screen.findByRole('dialog',{name:'공유 설정'}),toggle=within(dialog).getByRole('switch',{name:'공유 변경 알림'})
 expect(toggle).toBeChecked();let finish!:(v:Awaited<ReturnType<typeof f.api.setChangeNotifications>>)=>void
 f.api.setChangeNotifications=vi.fn(()=>new Promise<Awaited<ReturnType<typeof f.api.setChangeNotifications>>>(r=>{finish=r}));toggle.focus();await u.keyboard('[Space]');expect(toggle).toBeDisabled();expect(toggle).toBeChecked()
 await act(async()=>finish({ok:false,error:{code:'STORAGE_IO',message:'설정 저장 실패'}}));expect(toggle).toBeChecked();expect(within(dialog).getByText('설정 저장 실패')).toBeVisible()
 f.api.setChangeNotifications=vi.fn(async({enabled})=>{f.emit({changeNotifications:{...changeState,enabled}});return f.api.getState()})
 await u.click(toggle);await waitFor(()=>expect(toggle).not.toBeChecked());expect(f.m.snapshot.schedules[0].reminder).toEqual({daysBefore:2,time:'09:00',start:false,end:false})
})
it.each(['personal','host'] as const)('hides change reception control for %s role',async role=>{
 sharingFixture({role,settingsRequestToken:'settings',changeNotifications:changeState});render(<App api={memoryApi().api}/>);const dialog=await screen.findByRole('dialog',{name:'공유 설정'});expect(within(dialog).queryByRole('switch',{name:'공유 변경 알림'})).not.toBeInTheDocument()
})
it('explains the persisted baseline and legacy-host capability in settings',async()=>{
 const f=member({baselining:true,supported:null});render(<App api={f.m.api}/>);await screen.findByRole('button',{name:'수동 동기화'});await act(async()=>f.emit({settingsRequestToken:'settings'}));const dialog=await screen.findByRole('dialog',{name:'공유 설정'})
 expect(within(dialog).getByText('다음 동기화부터 새 변경 알림을 받습니다.')).toBeVisible();await act(async()=>f.emit({changeNotifications:{...changeState,supported:false}}));expect(within(dialog).getByText('변경 알림을 사용하려면 호스트와 멤버를 업데이트하세요.')).toBeVisible()
})
it('keeps change delivery warnings persistent and retries definite failures independently from date alarms',async()=>{
 const f=member({failed:2,unknown:1,storageError:true}),u=userEvent.setup();render(<App api={f.m.api}/>);
 expect(await screen.findByText(/공유 변경 알림 전송에 실패/)).toBeVisible();expect(screen.getByText(/공유 변경 알림 전송 결과를 확인/)).toBeVisible();expect(screen.getByText(/공유 변경 알림 처리 기록을 저장/)).toBeVisible()
 f.api.retryChangeNotifications=vi.fn(async()=>{f.emit({changeNotifications:{...changeState,unknown:1}});return f.api.getState()});await u.click(screen.getByRole('button',{name:'실패한 공유 변경 알림 재시도'}))
 await waitFor(()=>expect(screen.queryByText(/공유 변경 알림 전송에 실패/)).not.toBeInTheDocument());expect(screen.getByText(/공유 변경 알림 전송 결과를 확인/)).toBeVisible();expect(screen.queryByRole('button',{name:'실패한 공유 변경 알림 재시도'})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'오늘의 실패한 알림 재시도'})).not.toBeInTheDocument()
})
it('opens a fresh shared schedule readonly with own alarm, reveals its filter and preserves calendar mode',async()=>{
 const f=member(),u=userEvent.setup();render(<App api={f.m.api}/>);await u.click(await screen.findByRole('button',{name:'개인'}));await u.click(screen.getByRole('button',{name:'달력'}));f.m.snapshot.schedules[0].name='새 공유 이름';f.m.snapshot.schedules[0].startDate='2027-02-04';f.m.snapshot.schedules[0].endDate='2027-02-05'
 await f.click({kind:'schedule',id:'1',projectId:'1'});expect(await screen.findByLabelText('일정 이름')).toHaveValue('새 공유 이름');expect(screen.getByLabelText('일정 이름')).toHaveAttribute('readonly');expect(screen.getByLabelText('시작일 알림')).toBeEnabled();expect(screen.getByRole('button',{name:'달력'})).toHaveAttribute('aria-pressed','true');expect(screen.getByRole('button',{name:'전체'})).toHaveAttribute('aria-pressed','true')
 await u.click(screen.getByRole('switch',{name:'시작일 알림'}));expect(screen.getByRole('button',{name:'저장'})).toBeEnabled();expect(f.api.acknowledgeChange).toHaveBeenCalledWith({token:'click-1'})
})
it.each(['gantt','calendar'] as const)('reveals a filtered project in %s without opening the project editor',async mode=>{
 const f=member(),u=userEvent.setup();localStorage.setItem('simple-timeline.preferences.v1',JSON.stringify({collapsed:['1']}));render(<App api={f.m.api}/>);await u.click(await screen.findByRole('button',{name:'개인'}));if(mode==='calendar')await u.click(screen.getByRole('button',{name:'달력'}));await f.click({kind:'project',id:'1'})
 await waitFor(()=>expect(screen.getByRole('button',{name:'전체'})).toHaveAttribute('aria-pressed','true'));expect(screen.queryByLabelText('프로젝트 이름')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:mode==='gantt'?'간트':'달력'})).toHaveAttribute('aria-pressed','true')
 if(mode==='gantt'){await waitFor(()=>expect(screen.getByRole('button',{name:'1.1.1 핫픽스 접기'})).toBeVisible());await waitFor(()=>expect(screen.getByRole('button',{name:'1.1.1 핫픽스 편집'})).toHaveFocus())}
 else expect(await screen.findByRole('button',{name:'1.1.1 핫픽스 삭제'})).toBeDisabled()
})
it('keeps an editor draft when notification discard is cancelled and consumes that click',async()=>{
 const f=member(),u=userEvent.setup();render(<App api={f.m.api}/>);await u.click(await screen.findByRole('button',{name:'프로젝트 추가'}));await u.type(screen.getByLabelText('프로젝트 이름'),'보존 초안');await f.click({kind:'schedule',id:'1',projectId:'1'})
 await u.click(await screen.findByRole('button',{name:'계속 편집'}));expect(screen.getByLabelText('프로젝트 이름')).toHaveValue('보존 초안');expect(f.api.acknowledgeChange).toHaveBeenCalledWith({token:'click-1'});await act(async()=>f.emit({lastCheckedAt:'2026-11-11T00:00:00Z'}));expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
})
it.each(['deleted','revoked'] as const)('falls back to current list if the target is %s while discard confirmation is open',async scenario=>{
 const f=member(),u=userEvent.setup();render(<App api={f.m.api}/>);await u.click(await screen.findByRole('button',{name:'프로젝트 추가'}));await u.type(screen.getByLabelText('프로젝트 이름'),'초안');await f.click({kind:'schedule',id:'1',projectId:'1'});await screen.findByRole('alertdialog');await f.m.api.deleteProject({id:'1',confirmed:true});if(scenario==='revoked')await act(async()=>f.emit({status:'revoked',snapshotRevision:1}));await u.click(screen.getByRole('button',{name:'변경 버리기'}));expect(await screen.findByText('공유 대상이 삭제되거나 공유가 해제되어 현재 프로젝트 목록을 표시합니다.')).toBeVisible();expect(screen.queryByLabelText('일정 이름')).not.toBeInTheDocument();expect(screen.queryByLabelText('프로젝트 이름')).not.toBeInTheDocument();expect(within(await screen.findByRole('region',{name:'프로젝트 목록'})).getByRole('button',{name:'일정 없음 편집'})).toBeVisible()
})
it('defers notification while dirty sharing settings remain open and preserves both drafts on cancel',async()=>{
 const f=member(),u=userEvent.setup();render(<App api={f.m.api}/>);await u.click(await screen.findByRole('button',{name:'프로젝트 추가'}));await u.type(screen.getByLabelText('프로젝트 이름'),'편집 초안');await act(async()=>f.emit({settingsRequestToken:'settings'}));const dialog=await screen.findByRole('dialog',{name:'공유 설정'});await u.clear(within(dialog).getByLabelText('포트'));await u.type(within(dialog).getByLabelText('포트'),'47832');await f.click({kind:'schedule',id:'1',projectId:'1'});expect(within(dialog).getByLabelText('포트')).toHaveValue(47832);expect(f.api.acknowledgeChange).not.toHaveBeenCalled();await u.click(within(dialog).getByRole('button',{name:'공유 설정 닫기'}));await u.click(screen.getByRole('button',{name:'취소'}));expect(within(dialog).getByLabelText('포트')).toHaveValue(47832);await u.click(within(dialog).getByRole('button',{name:'공유 설정 닫기'}));await u.click(screen.getByRole('button',{name:'변경 버리기'}));await u.click(await screen.findByRole('button',{name:'계속 편집'}));expect(screen.getByLabelText('프로젝트 이름')).toHaveValue('편집 초안')
})
it('defers notification while a dirty quick alarm dialog remains open',async()=>{
 const f=member(),u=userEvent.setup();f.m.snapshot.schedules[0].reminder.start=true;render(<App api={f.m.api}/>);await u.click(await screen.findByRole('button',{name:'개발 알림 설정'}));const dialog=screen.getByRole('dialog',{name:'알림 설정'});await u.clear(within(dialog).getByLabelText('알림 며칠 전'));await u.type(within(dialog).getByLabelText('알림 며칠 전'),'4');await f.click({kind:'project',id:'1'});expect(f.api.acknowledgeChange).not.toHaveBeenCalled();await u.keyboard('{Escape}');await u.click(screen.getByRole('button',{name:'계속 편집'}));expect(within(dialog).getByLabelText('알림 며칠 전')).toHaveValue(4);await u.click(within(dialog).getByRole('button',{name:'알림 설정 닫기'}));await u.click(screen.getByRole('button',{name:'변경 버리기'}));await waitFor(()=>expect(f.api.acknowledgeChange).toHaveBeenCalledWith({token:'click-1'}));expect(screen.queryByLabelText('프로젝트 이름')).not.toBeInTheDocument()
})
it('discards a member alarm draft on confirmation even when reconciliation refreshes readonly source fields',async()=>{
 const f=member(),u=userEvent.setup();render(<App api={f.m.api}/>);await u.click(await screen.findByRole('button',{name:'개발 편집'}));await u.click(screen.getByRole('switch',{name:'시작일 알림'}));const read=f.m.api.getSnapshot;let release!:(result:Awaited<ReturnType<typeof read>>)=>void;const readSpy=vi.fn(read).mockImplementationOnce(read).mockImplementationOnce(()=>new Promise(resolve=>{release=resolve}));f.m.api.getSnapshot=readSpy;await f.click({kind:'project',id:'1'});await u.click(await screen.findByRole('button',{name:'변경 버리기'}));await waitFor(()=>expect(readSpy).toHaveBeenCalledTimes(2));await act(async()=>release(await read()));await waitFor(()=>expect(screen.queryByLabelText('일정 이름')).not.toBeInTheDocument());expect(screen.queryByLabelText('프로젝트 이름')).not.toBeInTheDocument();expect(f.m.snapshot.schedules[0].reminder.start).toBe(false)
})
it('preserves new input typed while the accepted notification is still reading its target',async()=>{
 const f=member(),u=userEvent.setup();render(<App api={f.m.api}/>);await u.click(await screen.findByRole('button',{name:'프로젝트 추가'}));await u.type(screen.getByLabelText('프로젝트 이름'),'초안');
 const read=f.m.api.getSnapshot;let release!:(result:Awaited<ReturnType<typeof read>>)=>void;const readSpy=vi.fn(read).mockImplementationOnce(read).mockImplementationOnce(()=>new Promise(resolve=>{release=resolve}));f.m.api.getSnapshot=readSpy
 await f.click({kind:'schedule',id:'1',projectId:'1'});await u.click(await screen.findByRole('button',{name:'변경 버리기'}));await waitFor(()=>expect(readSpy).toHaveBeenCalledTimes(2));await u.type(screen.getByLabelText('프로젝트 이름'),' 계속 입력');await act(async()=>release(await read()));expect(screen.getByLabelText('프로젝트 이름')).toHaveValue('초안 계속 입력');expect(screen.queryByLabelText('일정 이름')).not.toBeInTheDocument()
})
it('routes a list notice through the same dirty confirmation before showing the current list',async()=>{
 const f=member(),u=userEvent.setup();render(<App api={f.m.api}/>);await u.click(await screen.findByRole('button',{name:'프로젝트 추가'}));await u.type(screen.getByLabelText('프로젝트 이름'),'초안');await f.click({kind:'list'});await u.click(await screen.findByRole('button',{name:'변경 버리기'}));expect(await screen.findByRole('region',{name:'프로젝트 목록'})).toBeVisible();expect(screen.queryByLabelText('프로젝트 이름')).not.toBeInTheDocument()
})
it('rejects a schedule whose current project does not match the typed click target',async()=>{
 const f=member();render(<App api={f.m.api}/>);await screen.findByRole('button',{name:'수동 동기화'});await f.click({kind:'schedule',id:'1',projectId:'2'});expect(await screen.findByRole('region',{name:'프로젝트 목록'})).toBeVisible();expect(screen.queryByLabelText('일정 이름')).not.toBeInTheDocument()
})
it('defers a change click until the calendar day dialog closes',async()=>{
 const f=member(),u=userEvent.setup();f.m.snapshot.schedules=Array.from({length:5},(_,i)=>({...hotfix.schedules[0],id:String(i+1),startDate:'2026-12-15',endDate:'2026-12-15',sharing:'member'}));render(<App api={f.m.api} today={new Date(2026,11,3)}/>);await u.click(await screen.findByRole('button',{name:'달력'}));await u.click(screen.getByRole('button',{name:'2026-12-15 +2 더 보기'}));const dialog=screen.getByRole('dialog',{name:'2026-12-15 전체 일정 5개'});await f.click({kind:'project',id:'1'});expect(dialog).toBeVisible();expect(f.api.acknowledgeChange).not.toHaveBeenCalled();await u.keyboard('{Escape}');await waitFor(()=>expect(f.api.acknowledgeChange).toHaveBeenCalledWith({token:'click-1'}));expect(dialog).not.toBeInTheDocument();expect(await screen.findByRole('region',{name:'프로젝트 목록'})).toBeVisible();expect(screen.getByRole('button',{name:'달력'})).toHaveAttribute('aria-pressed','true')
})
