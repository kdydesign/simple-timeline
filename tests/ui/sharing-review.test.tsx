import {afterEach, expect, it, vi} from 'vitest'
import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {App} from '../../src/renderer/App'
import {sharedId} from '../../src/domain/sharing'
import type {SharedProjectInput} from '../../src/shared/sharing'
import {project, schedule} from '../fixtures/timeline'
import {memoryApi} from './fake-api'
import {sharingFixture} from './sharing-fixture'

afterEach(()=>{delete window.timelineSharing})
const names=['A','B','C']
const devices=names.map((name,i)=>({id:String(i+1),name:`PC-${name}`,ip:`192.168.0.${i+20}`,approved:true,revoked:false}))
const recipients=names.map((name,i)=>({name,deviceId:devices[i].id}))
for(const revoked of [0,1])it(`keeps participant slots after ${names[revoked]} revocation, reopen and explicit removal/save`,async()=>{
 const m=memoryApi({projects:[{...project(),participants:names,sharing:'host'}],schedules:[]})
 const remaining=recipients.filter((_,i)=>i!==revoked)
 const f=sharingFixture({role:'host',devices:devices.map((d,i)=>({...d,revoked:i===revoked})),projects:[{id:'1',participants:remaining}]})
 f.api.saveProject=vi.fn(async(input:SharedProjectInput)=>{if(input.participants.some(p=>!p.deviceId))return{ok:false as const,error:{code:'VALIDATION_ERROR' as const,message:'PC를 선택해 주세요.'}};const p={...m.snapshot.projects[0],...input,participants:input.participants.map(p=>p.name)};m.snapshot.projects[0]=p;return{ok:true as const,data:p}})
 const u=userEvent.setup();render(<App api={m.api}/>);await screen.findByRole('button',{name:'1.1.1 핫픽스 편집'})
 await u.click(screen.getByRole('button',{name:'1.1.1 핫픽스 편집'}));
 names.forEach((name,i)=>{expect(screen.getByLabelText(`참여자 ${i+1}`)).toHaveValue(name);expect(screen.getByRole('combobox',{name:`${name} PC`})).toHaveTextContent(i===revoked?/^$/:`PC-${name}`)})
 // A later mapped participant must never appear in the revoked participant's slot.
 expect(screen.getByRole('combobox',{name:`${names[revoked]} PC`})).not.toHaveTextContent(`PC-${names[revoked+1]}`)
 await u.click(screen.getByRole('button',{name:'취소'}));await u.click(screen.getByRole('button',{name:'1.1.1 핫픽스 편집'}))
 await u.click(screen.getByRole('button',{name:'저장'}));await waitFor(()=>expect(f.api.saveProject).toHaveBeenCalledWith(expect.objectContaining({participants:recipients.map((p,i)=>({...p,deviceId:i===revoked?'':p.deviceId}))})));expect(m.snapshot.projects[0].participants).toEqual(names)
 await u.click(screen.getByRole('button',{name:`참여자 ${revoked+1} 삭제`}));await u.click(screen.getByRole('button',{name:'저장'}))
 await waitFor(()=>expect(f.api.saveProject).toHaveBeenCalledWith(expect.objectContaining({participants:remaining})))
 expect(m.snapshot.projects[0].participants).toEqual(remaining.map(p=>p.name))
})
it('keeps an already-open dirty host draft stable after device revocation and removes the correct normal participant',async()=>{
 const m=memoryApi({projects:[{...project(),participants:names,sharing:'host'}],schedules:[]})
 const f=sharingFixture({role:'host',devices,projects:[{id:'1',participants:recipients}]})
 f.api.saveProject=vi.fn(async()=>({ok:false as const,error:{code:'VALIDATION_ERROR' as const,message:'회수된 PC를 다시 선택해 주세요.'}}))
 const u=userEvent.setup();render(<App api={m.api}/>);await u.click(await screen.findByRole('button',{name:'1.1.1 핫픽스 편집'}));await u.type(screen.getByLabelText('프로젝트 이름'),' 초안')
 act(()=>f.emit({snapshotRevision:1,devices:devices.map((d,i)=>({...d,revoked:i===0})),projects:[{id:'1',participants:recipients.slice(1)}]}))
 await waitFor(()=>expect(screen.getByLabelText('프로젝트 이름')).toHaveValue('1.1.1 핫픽스 초안'))
 expect(screen.getByLabelText('참여자 1')).toHaveValue('A');expect(screen.getByRole('combobox',{name:'B PC'})).toHaveTextContent('PC-B')
 await u.click(screen.getByRole('button',{name:'참여자 2 삭제'}));await u.click(screen.getByRole('button',{name:'저장'}))
 await waitFor(()=>expect(f.api.saveProject).toHaveBeenCalledWith(expect.objectContaining({participants:[recipients[0],recipients[2]]})))
 expect(m.snapshot.projects[0].participants).toEqual(names);expect(screen.getByLabelText('프로젝트 이름')).toHaveValue('1.1.1 핫픽스 초안')
})
function member() {
 const id=sharedId('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','1')
 const m=memoryApi({projects:[{...project(id),sharing:'member'}],schedules:[{...schedule(id,id,'0001-01-03','0001-01-04'),sharing:'member',reminder:{daysBefore:2,time:'09:00',start:true,end:false}}]})
 const f=sharingFixture({role:'member',status:'connected'})
 return {id,m,f}
}
const guidance=/알림 날짜가 0001-01-01 이전/
it('automatically guides correction after received dates underflow active local alarms and opens own reminder editor',async()=>{
 const {m,f}=member(),u=userEvent.setup();render(<App api={m.api}/>);await screen.findByRole('button',{name:'개발 편집'});expect(screen.queryByText(guidance)).not.toBeInTheDocument()
 m.snapshot.schedules[0].startDate='0001-01-01';act(()=>f.emit({snapshotRevision:1}))
 expect(await screen.findByText(guidance)).toBeVisible();expect(m.snapshot.schedules[0].reminder.start).toBe(true)
 await u.click(screen.getByRole('button',{name:'개발 알림 설정'}));expect(screen.getByLabelText('일정 이름')).toHaveAttribute('readonly');expect(screen.getByLabelText('알림 며칠 전')).toHaveValue(2)
 fireEvent.change(screen.getByLabelText('알림 며칠 전'),{target:{value:'0'}})
 await waitFor(()=>expect(screen.queryByText(guidance)).not.toBeInTheDocument());expect(screen.getByLabelText('시작일 알림')).toBeChecked();expect(f.api.saveReminder).not.toHaveBeenCalled()
})
it('revalidates latest source dates against dirty reminder settings and clears guidance on disable or corrected dates',async()=>{
 const {m,f}=member(),u=userEvent.setup();render(<App api={m.api}/>);await u.click(await screen.findByRole('button',{name:'개발 편집'}))
 fireEvent.change(screen.getByLabelText('알림 시각'),{target:{value:'10:45'}})
 m.snapshot.schedules[0].startDate='0001-01-01';act(()=>f.emit({snapshotRevision:1}))
 expect(await screen.findByText(guidance)).toBeVisible();await waitFor(()=>expect(screen.getByLabelText('시작일')).toHaveValue('0001-01-01'))
 await u.click(screen.getByRole('button',{name:'개발 알림 설정'}));expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();expect(screen.getByLabelText('알림 시각')).toHaveValue('10:45')
 await u.click(screen.getByLabelText('시작일 알림'));expect(screen.queryByText(guidance)).not.toBeInTheDocument();expect(screen.getByLabelText('알림 며칠 전')).toHaveValue(2)
 await u.click(screen.getByLabelText('시작일 알림'));expect(screen.getByText(guidance)).toBeVisible()
 m.snapshot.schedules[0].startDate='0001-01-03';act(()=>f.emit({snapshotRevision:2}));await waitFor(()=>expect(screen.queryByText(guidance)).not.toBeInTheDocument());expect(screen.getByLabelText('알림 시각')).toHaveValue('10:45');expect(document.documentElement.dataset.editorDirty).toBe('true');expect(f.api.saveReminder).not.toHaveBeenCalled()
})
it('does not flag disabled settings and guards opening correction against another dirty draft',async()=>{
 const {m,f}=member(),u=userEvent.setup();m.snapshot.schedules[0].reminder.start=false;m.snapshot.schedules[0].startDate='0001-01-01'
 render(<App api={m.api}/>);await u.click(await screen.findByRole('button',{name:'프로젝트 추가'}));await u.type(screen.getByLabelText('프로젝트 이름'),'보존할 개인 초안');expect(screen.queryByText(guidance)).not.toBeInTheDocument()
 m.snapshot.schedules[0].reminder.end=true;m.snapshot.schedules[0].endDate='0001-01-02';act(()=>f.emit({snapshotRevision:1}))
 expect(await screen.findByText(guidance)).toBeVisible();await u.click(screen.getByRole('button',{name:'개발 알림 설정'}));const dialog=screen.getByRole('alertdialog');expect(dialog).toHaveTextContent('저장하지 않은 입력');await u.click(within(dialog).getByRole('button',{name:'계속 편집'}));expect(screen.getByLabelText('프로젝트 이름')).toHaveValue('보존할 개인 초안')
})
