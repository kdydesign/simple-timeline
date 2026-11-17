import {it,expect,vi} from 'vitest'
import {render,screen,within,waitFor,act,fireEvent} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {App} from '../../src/renderer/App'
import {memoryApi} from './fake-api'
import {hotfix} from '../fixtures/timeline'
it('validates first, then retains a new schedule draft on cancel and writes only on confirmation',async()=>{
 const m=memoryApi(hotfix),u=userEvent.setup(),create=vi.spyOn(m.api,'createSchedule');render(<App api={m.api}/>);
 await u.click(await screen.findByRole('button',{name:'일정 추가'}));await u.click(screen.getByRole('button',{name:'저장'}));expect(screen.queryByRole('alertdialog')).toBeNull();
 await u.type(screen.getByLabelText('일정 이름'),'확인할 일정');await u.click(screen.getByRole('button',{name:'저장'}));expect(create).not.toHaveBeenCalled();
 await u.click(within(screen.getByRole('alertdialog')).getByRole('button',{name:'취소'}));expect(screen.getByLabelText('일정 이름')).toHaveValue('확인할 일정');
 await u.click(screen.getByRole('button',{name:'저장'}));await u.click(within(screen.getByRole('alertdialog')).getByRole('button',{name:'일정 추가'}));await waitFor(()=>expect(create).toHaveBeenCalledTimes(1));
})
it('confirms a changed schedule before mutation and preserves cancelled reminder input',async()=>{
 const data=structuredClone(hotfix);data.schedules[0].reminder.start=true;const m=memoryApi(data),u=userEvent.setup(),update=vi.spyOn(m.api,'updateSchedule'),reminder=vi.spyOn(m.api,'updateScheduleReminder');render(<App api={m.api}/>);
 await u.click(await screen.findByRole('button',{name:'개발 편집'}));await u.type(screen.getByLabelText('일정 이름'),' 변경');await u.click(screen.getByRole('button',{name:'저장'}));expect(update).not.toHaveBeenCalled();await u.click(within(screen.getByRole('alertdialog')).getByRole('button',{name:'변경'}));await waitFor(()=>expect(screen.queryByLabelText('일정 이름')).toBeNull());expect(update).toHaveBeenCalledTimes(1);
 await u.click(screen.getByRole('button',{name:'개발 변경 알림 설정'}));let popup=screen.getByRole('dialog',{name:'알림 설정'});await u.click(within(popup).getByRole('switch',{name:'종료일 알림'}));await u.click(within(popup).getByRole('button',{name:'저장'}));expect(reminder).not.toHaveBeenCalled();await u.click(within(screen.getByRole('alertdialog')).getByRole('button',{name:'취소'}));popup=screen.getByRole('dialog',{name:'알림 설정'});expect(within(popup).getByRole('switch',{name:'종료일 알림'})).toBeChecked();expect(within(popup).queryByRole('alert')).toBeNull();
})
it('confirms list deletion once and includes all child schedules without deleting on cancel',async()=>{
 const m=memoryApi(hotfix),u=userEvent.setup(),remove=vi.spyOn(m.api,'deleteProject');render(<App api={m.api}/>);await u.click(await screen.findByRole('button',{name:'프로젝트 목록'}));await u.click(screen.getByRole('button',{name:'1.1.1 핫픽스 삭제'}));expect(remove).not.toHaveBeenCalled();expect(screen.getByRole('alertdialog')).toHaveTextContent('하위 일정 3개');await u.click(within(screen.getByRole('alertdialog')).getByRole('button',{name:'취소'}));expect(m.snapshot.schedules).toHaveLength(3);
 await u.click(screen.getByRole('button',{name:'프로젝트 목록'}));await u.click(screen.getByRole('button',{name:'1.1.1 핫픽스 삭제'}));await u.click(within(screen.getByRole('alertdialog')).getByRole('button',{name:'함께 삭제'}));await waitFor(()=>expect(remove).toHaveBeenCalledTimes(1));expect(m.snapshot.schedules).toHaveLength(0);
})

it('does not save a member reminder after its source is revoked during confirmation',async()=>{
 const {sharingFixture}=await import('./sharing-fixture');const f=sharingFixture({role:'member',status:'connected'}),m=memoryApi(hotfix),u=userEvent.setup();m.snapshot.projects[0].sharing='member';m.snapshot.schedules[0].sharing='member';const write=vi.spyOn(m.api,'updateSchedule');render(<App api={m.api}/>);
 await u.click(await screen.findByRole('button',{name:'개발 편집'}));await u.click(screen.getByRole('switch',{name:'시작일 알림'}));await u.click(screen.getByRole('button',{name:'저장'}));
 m.snapshot.schedules.splice(0);m.snapshot.projects.splice(0);act(()=>f.emit({snapshotRevision:2,status:'revoked'}));await waitFor(()=>expect(screen.getByText(/더 이상 공유/)).toBeInTheDocument());
 await u.click(within(screen.getByRole('alertdialog')).getByRole('button',{name:'변경'}));expect(f.api.saveReminder).not.toHaveBeenCalled();expect(write).not.toHaveBeenCalled();expect(screen.getByText(/대상이나 저장 상태가 변경/)).toBeVisible();
})
it('a repeated confirmation click never submits a new schedule twice',async()=>{
 const m=memoryApi(hotfix),u=userEvent.setup(),create=vi.spyOn(m.api,'createSchedule');render(<App api={m.api}/>);await u.click(await screen.findByRole('button',{name:'일정 추가'}));await u.type(screen.getByLabelText('일정 이름'),'한 번만');await u.click(screen.getByRole('button',{name:'저장'}));const button=within(screen.getByRole('alertdialog')).getByRole('button',{name:'일정 추가'});act(()=>{fireEvent.click(button);fireEvent.click(button)});await waitFor(()=>expect(create).toHaveBeenCalledTimes(1));
})
it('requires a fresh deletion review when child schedules changed while the dialog was open',async()=>{
 const {sharingFixture}=await import('./sharing-fixture');const f=sharingFixture({role:'host',status:'connected'}),m=memoryApi(hotfix),u=userEvent.setup(),remove=vi.spyOn(m.api,'deleteProject');render(<App api={m.api}/>);await u.click(await screen.findByRole('button',{name:'프로젝트 목록'}));await u.click(screen.getByRole('button',{name:'1.1.1 핫픽스 삭제'}));
 m.snapshot.schedules.push({...m.snapshot.schedules[0],id:'999',name:'추가된 일정'});await act(async()=>{f.emit({snapshotRevision:2});await Promise.resolve();await Promise.resolve()});
 await u.click(within(screen.getByRole('alertdialog')).getByRole('button',{name:'함께 삭제'}));expect(remove).not.toHaveBeenCalled();expect(m.snapshot.schedules).toHaveLength(4);
})
