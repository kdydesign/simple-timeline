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
 fireEvent.change(screen.getByLabelText('휴일 날짜'),{target:{value:'2026-11-20'}})
 v.rerender(<HolidaySettings {...props} state={{...state,calendar:{...state.calendar}}}/>);
 expect(screen.getByLabelText('휴일 이름')).toHaveValue('휴무')
 fireEvent.click(screen.getByRole('button',{name:'휴일 추가'}));expect(screen.getByRole('alert')).toHaveTextContent('같은 날짜');expect(save).not.toHaveBeenCalled()
})
it('member holidays are readonly and explicitly retain last received information',()=>{
 render(<HolidaySettings state={{...state,status:'stale',lastReceivedAt:'2026-11-17T01:00:00.000Z'}} host={false} busy={false} onSave={vi.fn()} onDirty={()=>{}}/>);
 expect(screen.getByText(/마지막 수신 기준/)).toBeInTheDocument();expect(screen.queryByRole('button',{name:'휴일 추가'})).not.toBeInTheDocument();expect(screen.getByText('창립기념일')).toBeInTheDocument();expect(screen.queryAllByRole('button')).toHaveLength(0);expect(screen.getByText('요일 휴일',{exact:true})).toBeInTheDocument()
})
it('both date views use configured holidays instead of hardcoded weekends',()=>{
 const props={snapshot:hotfix,selectedMonth:{year:2026,month:11},onEditProject:()=>{},onEditSchedule:()=>{},onAddSchedule:()=>{},holidays:state.calendar}
 const g=render(<GanttView {...props}/>);
 expect(g.container.querySelector('[data-day="2026-11-20"]')).toHaveClass('nonworking-day')
 expect(g.container.querySelector('[data-day="2026-11-21"]')).not.toHaveClass('nonworking-day');g.unmount()
 const c=render(<CalendarView {...props}/>);
 expect(c.container.querySelector('[data-date="2026-11-20"]')).toHaveClass('nonworking-day')
 expect(c.container.querySelector('[data-date="2026-11-21"]')).not.toHaveClass('nonworking-day')
 expect(screen.getByText('창립기념일')).toBeInTheDocument()
})
