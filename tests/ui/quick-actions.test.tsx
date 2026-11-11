import {it,expect,vi} from 'vitest'
import {render,screen,waitFor,within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {App} from '../../src/renderer/App'
import {memoryApi} from './fake-api'
import {hotfix} from '../fixtures/timeline'
const fixture=()=>({...hotfix,schedules:hotfix.schedules.map((s,i)=>({...s,reminder:{...s.reminder,start:i===0}}))})
it('deletes a project and its schedules from the list without a confirmation',async()=>{
 const m=memoryApi(hotfix),u=userEvent.setup();render(<App api={m.api}/>);
 await u.click(await screen.findByRole('button',{name:'프로젝트 목록'}));
 await u.click(screen.getByRole('button',{name:'1.1.1 핫픽스 삭제'}));
 await waitFor(()=>expect(m.snapshot.projects).toHaveLength(1));expect(m.snapshot.schedules).toHaveLength(0);expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
 await waitFor(()=>expect(screen.getByRole('button',{name:'프로젝트 목록'})).toHaveFocus());
});
it('blocks list deletion and quick reminder opening while an editor is dirty',async()=>{
 Object.defineProperty(window,'innerWidth',{value:1707,writable:true,configurable:true});
 const m=memoryApi(fixture()),u=userEvent.setup();render(<App api={m.api}/>);
 await u.click(await screen.findByRole('button',{name:'QA 편집'}));await u.type(screen.getByLabelText('일정 이름'),' 초안');
 await u.click(screen.getByRole('button',{name:'개발 알림 설정'}));expect(screen.queryByRole('dialog',{name:'알림 설정'})).not.toBeInTheDocument();expect(screen.getByText('먼저 저장하거나 변경을 버려주세요.')).toBeVisible();
 await u.click(screen.getByRole('button',{name:'프로젝트 목록'}));await u.click(screen.getByRole('button',{name:'1.1.1 핫픽스 삭제'}));expect(m.snapshot.projects).toHaveLength(2);expect(screen.getByLabelText('일정 이름')).toHaveValue('QA 초안');
});
it('saves only reminder settings and protects a changed quick draft on escape',async()=>{
 const m=memoryApi(fixture()),u=userEvent.setup();const update=vi.spyOn(m.api,'updateSchedule');render(<App api={m.api}/>);
 await u.click(await screen.findByRole('button',{name:'개발 알림 설정'}));const dialog=screen.getByRole('dialog',{name:'알림 설정'});
 await u.clear(within(dialog).getByLabelText('알림 며칠 전'));await u.type(within(dialog).getByLabelText('알림 며칠 전'),'4');await u.keyboard('{Escape}');
 expect(screen.getByRole('alertdialog')).toBeVisible();await u.click(screen.getByRole('button',{name:'계속 편집'}));expect(within(dialog).getByLabelText('알림 며칠 전')).toHaveValue(4);
 await u.click(within(dialog).getByRole('button',{name:'저장'}));await waitFor(()=>expect(screen.queryByRole('dialog',{name:'알림 설정'})).not.toBeInTheDocument());
 expect(m.snapshot.schedules[0].reminder.daysBefore).toBe(4);expect(m.snapshot.schedules[0].name).toBe('개발');expect(m.snapshot.schedules[0].startDate).toBe('2026-11-11');expect(update).not.toHaveBeenCalled();
});
it('keeps failed quick drafts, marks quit dirty, and permits cancellation after an unknown result',async()=>{
 const m=memoryApi(fixture()),u=userEvent.setup();m.api.updateScheduleReminder=async()=>({ok:false,error:{code:'IPC_UNAVAILABLE',message:'알림 저장 결과 불명'}});render(<App api={m.api}/>);
 await u.click(await screen.findByRole('button',{name:'개발 알림 설정'}));const dialog=screen.getByRole('dialog',{name:'알림 설정'});
 await u.clear(within(dialog).getByLabelText('알림 시각'));await u.type(within(dialog).getByLabelText('알림 시각'),'10:30');expect(document.documentElement.dataset.editorDirty).toBe('true');
 await u.click(within(dialog).getByRole('button',{name:'저장'}));await waitFor(()=>expect(within(dialog).getByRole('button',{name:'다시 조회'})).toBeEnabled());expect(within(dialog).getByLabelText('알림 시각')).toHaveValue('10:30');expect(within(dialog).getByRole('button',{name:'저장'})).toBeDisabled();
 await u.click(within(dialog).getByRole('button',{name:'알림 설정 닫기'}));await u.click(screen.getByRole('button',{name:'변경 버리기'}));expect(screen.queryByRole('dialog',{name:'알림 설정'})).not.toBeInTheDocument();expect(document.documentElement.dataset.editorDirty).toBe('false');
});
it('validates quick reminder fields without saving, and removes the icon after disabling both reminders',async()=>{
 const m=memoryApi(fixture()),u=userEvent.setup();render(<App api={m.api}/>);await u.click(await screen.findByRole('button',{name:'개발 알림 설정'}));const dialog=screen.getByRole('dialog',{name:'알림 설정'});
 await u.clear(within(dialog).getByLabelText('알림 며칠 전'));await u.type(within(dialog).getByLabelText('알림 며칠 전'),'366');await u.clear(within(dialog).getByLabelText('알림 시각'));await u.type(within(dialog).getByLabelText('알림 시각'),'88:99');await u.click(within(dialog).getByRole('button',{name:'저장'}));
 expect(within(dialog).getAllByRole('alert')).toHaveLength(2);expect(within(dialog).getByLabelText('알림 며칠 전')).toHaveFocus();expect(m.snapshot.schedules[0].reminder.daysBefore).toBe(2);
 await u.clear(within(dialog).getByLabelText('알림 며칠 전'));await u.type(within(dialog).getByLabelText('알림 며칠 전'),'0');await u.clear(within(dialog).getByLabelText('알림 시각'));await u.type(within(dialog).getByLabelText('알림 시각'),'09:00');await u.click(within(dialog).getByRole('switch',{name:'시작일 알림'}));await u.click(within(dialog).getByRole('button',{name:'저장'}));
 await waitFor(()=>expect(screen.queryByRole('dialog',{name:'알림 설정'})).not.toBeInTheDocument());expect(screen.queryByRole('button',{name:'개발 알림 설정'})).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'개발 편집'})).toHaveFocus();
});
it('keeps member project deletion disabled and saves shared reminders only to the member capability',async()=>{
 const {sharingFixture}=await import('./sharing-fixture');const f=sharingFixture({role:'member',status:'connected'});
 const data=fixture();data.projects[0]={...data.projects[0],sharing:'member'} as typeof data.projects[0];data.schedules[0]={...data.schedules[0],sharing:'member'} as typeof data.schedules[0];
 const m=memoryApi(data),u=userEvent.setup();const local=vi.spyOn(m.api,'updateScheduleReminder');f.api.saveReminder=vi.fn(async input=>{m.snapshot.schedules[0].reminder=input.reminder;return {ok:true as const,data:structuredClone(m.snapshot.schedules[0])}});render(<App api={m.api}/>);
 await u.click(await screen.findByRole('button',{name:'프로젝트 목록'}));expect(screen.getByRole('button',{name:'1.1.1 핫픽스 삭제'})).toBeDisabled();await u.keyboard('{Escape}');
 await u.click(screen.getByRole('button',{name:'개발 알림 설정'}));const dialog=screen.getByRole('dialog',{name:'알림 설정'});await u.click(within(dialog).getByRole('switch',{name:'종료일 알림'}));await u.click(within(dialog).getByRole('button',{name:'저장'}));
 await waitFor(()=>expect(screen.queryByRole('dialog',{name:'알림 설정'})).not.toBeInTheDocument());expect(local).not.toHaveBeenCalled();expect(m.snapshot.schedules[0].reminder.end).toBe(true);expect(f.api.saveReminder).toHaveBeenCalledTimes(1);
});
