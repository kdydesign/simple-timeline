import {it,expect,vi} from 'vitest'
import {render,screen,fireEvent} from '@testing-library/react'
import {HolidaySettings} from '../../src/renderer/components/HolidaySettings'
import {CalendarView} from '../../src/renderer/components/CalendarView'
import {GanttView} from '../../src/renderer/components/GanttView'
import {hotfix} from '../fixtures/timeline'
import type {HolidayState} from '../../src/shared/holidays'
const state:HolidayState={calendar:{weekdays:[3],dates:[{date:'2026-11-20',name:'창립기념일'}]},status:'host',lastReceivedAt:null,message:''}
it('host holiday draft survives state refresh and rejects duplicate dates before saving',async()=>{
 const save=vi.fn(async()=>({ok:true as const,data:{}})),props={state,host:true,busy:false,onSave:save,onDirty:()=>{}}
 const v=render(<HolidaySettings {...props}/>);
 fireEvent.change(screen.getByLabelText('휴일 이름'),{target:{value:'휴무'}})
 fireEvent.change(screen.getByLabelText('시작일'),{target:{value:'2026-11-20'}})
 fireEvent.change(screen.getByLabelText('종료일'),{target:{value:'2026-11-20'}})
 v.rerender(<HolidaySettings {...props} state={{...state,calendar:{...state.calendar}}}/>);
 expect(screen.getByLabelText('휴일 이름')).toHaveValue('휴무')
 fireEvent.click(screen.getByRole('button',{name:'휴일 추가'}));expect(screen.getByRole('alert')).toHaveTextContent('창립기념일');expect(save).not.toHaveBeenCalled()
})
it('member holidays are readonly and explicitly retain last received information',()=>{
 render(<HolidaySettings state={{...state,status:'stale',lastReceivedAt:'2026-11-17T01:00:00.000Z'}} host={false} busy={false} onSave={vi.fn()} onDirty={()=>{}}/>);
 expect(screen.getByText(/마지막 수신 기준/)).toBeInTheDocument();expect(screen.queryByRole('button',{name:'휴일 추가'})).not.toBeInTheDocument();expect(screen.getByText('창립기념일')).toBeInTheDocument();expect(screen.queryAllByRole('button')).toHaveLength(0);expect(screen.getByText('요일 휴일',{exact:true})).toBeInTheDocument()
})
it('both date views use configured holidays instead of hardcoded weekends',()=>{
 const props={snapshot:hotfix,selectedMonth:{year:2026,month:11},onEditProject:()=>{},onEditSchedule:()=>{},onAddSchedule:()=>{},holidays:state.calendar}
 const g=render(<GanttView {...props}/>);
 expect(g.container.querySelector('[data-day="2026-11-20"]')).toHaveClass('nonworking-day')
 expect(g.container.querySelector('[data-day="2026-11-20"] .holiday-marker')).toBeInTheDocument()
 expect(g.container.querySelector('.gantt-track .holiday-marker')).not.toBeInTheDocument()
 expect(g.container.querySelector('[data-day="2026-11-21"]')).not.toHaveClass('nonworking-day');g.unmount()
 const c=render(<CalendarView {...props}/>);
 expect(c.container.querySelector('[data-date="2026-11-20"]')).toHaveClass('nonworking-day')
 expect(c.container.querySelector('[data-date="2026-11-21"]')).not.toHaveClass('nonworking-day')
 expect(c.container.querySelector('[data-date="2026-11-20"] .holiday-marker')).toBeInTheDocument()
 expect(c.container.querySelector('.calendar-holiday-name')).not.toBeInTheDocument()
 expect(screen.queryByText(/매주.*요일 휴무/)).not.toBeInTheDocument()
})

it('starts both dates today without a dirty draft and saves one inclusive range',async()=>{
 const save=vi.fn(async()=>({ok:true as const,data:{}})),dirty=vi.fn()
 render(<HolidaySettings state={state} host busy={false} onSave={save} onDirty={dirty}/>);
 const d=new Date(),today=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
 expect(screen.getByLabelText('시작일')).toHaveValue(today);expect(screen.getByLabelText('종료일')).toHaveValue(today);expect(dirty).toHaveBeenLastCalledWith(false)
 fireEvent.change(screen.getByLabelText('시작일'),{target:{value:'2026-12-24'}});fireEvent.change(screen.getByLabelText('종료일'),{target:{value:'2026-12-26'}});fireEvent.change(screen.getByLabelText('휴일 이름'),{target:{value:'연말 휴무'}})
 fireEvent.click(screen.getByRole('button',{name:'휴일 추가'}));expect(save).toHaveBeenCalledWith({weekdays:[3],dates:[{date:'2026-11-20',name:'창립기념일'},{date:'2026-12-24',endDate:'2026-12-26',name:'연말 휴무'}]})
})
it('edits and deletes a range as one item and preserves failed drafts',async()=>{
 const range={...state,calendar:{weekdays:[0,6],dates:[{date:'2026-12-24',endDate:'2026-12-26',name:'연말 휴무'}]}}
 const save=vi.fn(async()=>({ok:false as const,error:{code:'STORAGE_IO' as const,message:'저장 실패'}}))
 render(<HolidaySettings state={range} host busy={false} onSave={save} onDirty={()=>{}}/>);
 fireEvent.click(screen.getByRole('button',{name:'연말 휴무 휴일 수정'}));expect(screen.getByLabelText('종료일')).toHaveValue('2026-12-26')
 fireEvent.change(screen.getByLabelText('종료일'),{target:{value:'2026-12-27'}});fireEvent.click(screen.getByRole('button',{name:'휴일 저장'}));await screen.findByText('저장 실패');expect(screen.getByLabelText('종료일')).toHaveValue('2026-12-27')
 fireEvent.click(screen.getByRole('button',{name:'연말 휴무 휴일 삭제'}));expect(save).toHaveBeenLastCalledWith({weekdays:[0,6],dates:[]})
})
