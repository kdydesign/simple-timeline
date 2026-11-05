import {it,expect,afterEach,vi} from 'vitest'
import {render,screen,waitFor,fireEvent,act} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {App} from '../../src/renderer/App'
import {memoryApi} from './fake-api'
import {hotfix} from '../fixtures/timeline'
import type {ReminderApi,ReminderState} from '../../src/shared/reminder-api'
afterEach(()=>{delete window.timelineReminders})
it('edits reminder defaults with the schedule, keeps empty numeric input and validates it',async()=>{
 const u=userEvent.setup(),m=memoryApi(hotfix);render(<App api={m.api}/>)
 await u.click(await screen.findByRole('button',{name:'일정 추가'}))
 expect(screen.getByLabelText('알림 며칠 전')).toHaveValue(2);expect(screen.getByLabelText('알림 시각')).toHaveValue('09:00')
 expect(screen.getByLabelText('시작일 알림')).not.toBeChecked()
 await u.type(screen.getByLabelText('일정 이름'),'알림 테스트')
 await u.clear(screen.getByLabelText('알림 며칠 전'));await u.click(screen.getByRole('button',{name:'저장'}))
 expect(await screen.findByText('알림은 0~365일 전의 정수로 입력해 주세요.')).toBeVisible()
 await u.type(screen.getByLabelText('알림 며칠 전'),'0');await u.click(screen.getByLabelText('시작일 알림'))
 fireEvent.change(screen.getByLabelText('알림 시각'),{target:{value:'13:45'}})
 await u.click(screen.getByRole('button',{name:'저장'}))
 await waitFor(()=>expect(m.snapshot.schedules.at(-1)?.reminder).toEqual({daysBefore:0,time:'13:45',start:true,end:false}))
})
function notifications(){
 let state:ReminderState={failed:0,unknown:0,storageError:false,openRequest:null},listener=()=>{}
 const api:ReminderApi={getState:async()=>({ok:true as const,data:state}),retry:vi.fn(async()=>({ok:true as const,data:state})),acknowledge:vi.fn(async(token)=>{if(state.openRequest?.token===token)state={...state,openRequest:null};return {ok:true as const,data:state}}),onChange:cb=>{listener=cb;return ()=>{listener=()=>{}}}}
 window.timelineReminders=api
 return {api,open(id:string){state={...state,openRequest:{token:1,scheduleId:id}};act(()=>listener())}}
}
it('notification click preserves a dirty draft when discard is cancelled',async()=>{
 const n=notifications(),u=userEvent.setup(),m=memoryApi(hotfix);render(<App api={m.api}/>)
 await u.click(await screen.findByRole('button',{name:'프로젝트 추가'}));await u.type(screen.getByLabelText('프로젝트 이름'),'보존할 초안')
 n.open('1');expect(await screen.findByRole('alertdialog')).toBeVisible();await u.click(screen.getByRole('button',{name:'계속 편집'}))
 expect(screen.getByLabelText('프로젝트 이름')).toHaveValue('보존할 초안');expect(n.api.acknowledge).toHaveBeenCalledWith(1)
})
it('notification click uses fresh data and reports a deleted schedule',async()=>{
 const n=notifications(),m=memoryApi(hotfix);render(<App api={m.api}/>);await screen.findByRole('button',{name:'프로젝트 추가'})
 await m.api.deleteSchedule({id:'1'});n.open('1');expect(await screen.findByText('이미 삭제된 일정입니다.')).toBeVisible()
})
