import {it,expect,vi} from 'vitest'
import {renderHook,act} from '@testing-library/react'
import {useSharingView} from '../../src/renderer/state/useSharingView'
import {useScheduleDrag} from '../../src/renderer/state/useScheduleDrag'
import {project,schedule} from '../fixtures/timeline'
import {toOrdinal} from '../../src/domain/date'
import type {TimelineSnapshot} from '../../src/shared/types'
function pointer(type:string,x:number){const e=new Event(type,{bubbles:true,cancelable:true});Object.assign(e,{clientX:x,clientY:20,pointerId:1,button:0,isPrimary:true});window.dispatchEvent(e)}
it('defers incoming shared additions/range changes until the personal drag commits exact dates',()=>{
 const original=schedule('1','1','2026-11-01','2026-11-01'),commit=vi.fn();const initial:TimelineSnapshot={projects:[project()],schedules:[original]};
 const h=renderHook(({snapshot})=>{const view=useSharingView(snapshot,'all');const first=view.snapshot!.schedules.reduce((date,s)=>s.startDate<date?s.startDate:date,'2026-11-01');const drag=useScheduleDrag({enabled:!view.dragInvalidated,onDragStart:()=>{view.beginDrag();return true},onDragEnd:view.endDrag,onDragCommit:commit,dateAt:x=>toOrdinal(first)+Math.floor(x/28)});return{view,drag}},{initialProps:{snapshot:initial}});
 act(()=>h.result.current.drag.begin({button:0,isPrimary:true,pointerId:1,clientX:14,clientY:20,stopPropagation(){},preventDefault(){}} as never,original));act(()=>pointer('pointermove',42));
 const remote={...schedule('2','2','2020-01-01','2020-01-02'),sharing:'member' as const};h.rerender({snapshot:{projects:[project(),{...project('2'),sharing:'member'}],schedules:[original,remote]}});
 expect(h.result.current.view.snapshot?.schedules).toHaveLength(1);act(()=>pointer('pointerup',70));expect(commit).toHaveBeenCalledWith(original,{startDate:'2026-11-03',endDate:'2026-11-03'});expect(h.result.current.view.snapshot?.schedules).toHaveLength(2);
});
it('applies confirmed shared removal immediately and cancels a personal preview without committing',()=>{
 const personal=schedule('1','1','2026-11-01','2026-11-01'),remote={...schedule('2','2','2026-11-02','2026-11-03'),sharing:'member' as const},commit=vi.fn();
 const initial:TimelineSnapshot={projects:[project(),{...project('2'),sharing:'member'}],schedules:[personal,remote]};
 const h=renderHook(({snapshot})=>{const view=useSharingView(snapshot,'all');const drag=useScheduleDrag({enabled:!view.dragInvalidated,onDragStart:()=>{view.beginDrag();return true},onDragEnd:view.endDrag,onDragCommit:commit,dateAt:x=>toOrdinal('2026-11-01')+Math.floor(x/28)});return{view,drag}},{initialProps:{snapshot:initial}});
 act(()=>h.result.current.drag.begin({button:0,isPrimary:true,pointerId:1,clientX:14,clientY:20,stopPropagation(){},preventDefault(){}} as never,personal));act(()=>pointer('pointermove',42));h.rerender({snapshot:{projects:[project()],schedules:[personal]}});expect(h.result.current.drag.preview).toBeNull();expect(h.result.current.view.snapshot?.schedules).toEqual([personal]);act(()=>pointer('pointerup',70));expect(commit).not.toHaveBeenCalled();
});
