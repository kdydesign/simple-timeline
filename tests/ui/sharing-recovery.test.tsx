import {it,expect,vi} from 'vitest'
import {render,screen,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {App} from '../../src/renderer/App'
import {memoryApi} from './fake-api'
import {sharingFixture} from './sharing-fixture'
import {hotfix} from '../fixtures/timeline'
import type {SharedProjectInput} from '../../src/shared/sharing'
it.each(['project','reminder'] as const)('keeps an externally committed %s draft recoverable after refresh failure without replaying its save',async(kind)=>{
 const u=userEvent.setup(),m=memoryApi(kind==='project'?undefined:hotfix),f=sharingFixture({role:kind==='project'?'host':'member'}),read=m.api.getSnapshot;
 let failRead=false;m.api.getSnapshot=async()=>failRead?{ok:false,error:{code:'STORAGE_IO',message:'확정 후 화면 읽기 실패'}}:read();
 if(kind==='project')f.api.saveProject=vi.fn(async(input:SharedProjectInput)=>{const result=await m.api.createProject({...input,participants:input.participants.map(p=>p.name)});if(result.ok){m.snapshot.projects[0].sharing='host';failRead=true}return result});
 else{m.snapshot.projects[0].sharing='member';m.snapshot.schedules[0].sharing='member';f.api.saveReminder=vi.fn(async({id,reminder})=>{const schedule=m.snapshot.schedules.find(s=>s.id===id)!;schedule.reminder=reminder;failRead=true;return{ok:true as const,data:schedule}})}
 render(<App api={m.api}/>);
 if(kind==='project'){
  const add=await screen.findByRole('button',{name:'프로젝트 추가'});await waitFor(()=>expect(add).toBeEnabled());await u.click(add);await u.type(screen.getByLabelText('프로젝트 이름'),'공유 저장 복구');await u.click(screen.getByLabelText('공유 프로젝트로 저장'));await u.click(screen.getByRole('button',{name:'저장'}));await u.click(screen.getByRole('button',{name:'공유로 저장'}));
 }else{await u.click(await screen.findByRole('button',{name:'개발 편집'}));await u.click(screen.getByLabelText('시작일 알림'));await u.click(screen.getByRole('button',{name:'저장'}))}
 const alert=await screen.findByRole('alert');expect(alert).toHaveTextContent('저장은 완료했지만 새로고침에 실패');expect(screen.getByRole('dialog')).toBeVisible();expect(screen.getByRole('button',{name:'저장'})).toBeDisabled();expect(screen.getByRole('status')).not.toHaveTextContent('추가했습니다');
 failRead=false;await u.click(screen.getByRole('button',{name:'다시 조회'}));await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());expect(kind==='project'?f.api.saveProject:f.api.saveReminder).toHaveBeenCalledOnce();expect(m.creates).toBe(kind==='project'?1:0);
});
it('blocks replay of an external create with a lost result until explicit lookup',async()=>{
 const u=userEvent.setup(),m=memoryApi(),f=sharingFixture({role:'host'});f.api.saveProject=vi.fn(async(input:SharedProjectInput)=>{await m.api.createProject({...input,participants:[]});throw Error('committed response lost')});render(<App api={m.api}/>);const add=await screen.findByRole('button',{name:'프로젝트 추가'});await waitFor(()=>expect(add).toBeEnabled());await u.click(add);await u.type(screen.getByLabelText('프로젝트 이름'),'한 번만 생성');await u.click(screen.getByLabelText('공유 프로젝트로 저장'));await u.click(screen.getByRole('button',{name:'저장'}));await u.click(screen.getByRole('button',{name:'공유로 저장'}));await waitFor(()=>expect(screen.getByRole('button',{name:'저장'})).toBeDisabled());expect(document.documentElement.dataset.timelinePhase).toBe('uncertain');expect(m.creates).toBe(1);await u.click(screen.getByRole('button',{name:'다시 조회'}));await waitFor(()=>expect(document.documentElement.dataset.timelinePhase).toBe('ready'));expect(m.creates).toBe(1);expect(f.api.saveProject).toHaveBeenCalledOnce();expect(screen.getByLabelText('프로젝트 이름')).toHaveValue('한 번만 생성');
});
