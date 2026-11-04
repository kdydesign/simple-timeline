import {it,expect,vi} from 'vitest'
import {renderHook,act} from '@testing-library/react'
import {useScheduleDrag} from '../../src/renderer/state/useScheduleDrag'
import {schedule} from '../fixtures/timeline'
import {toOrdinal} from '../../src/domain/date'
const original=schedule('1','1','2026-11-01','2026-11-01')
function pointer(type:string,x:number,y=20){
  const event=new Event(type,{bubbles:true,cancelable:true})
  Object.assign(event,{clientX:x,clientY:y,pointerId:1,button:0,isPrimary:true})
  window.dispatchEvent(event)
}
function setup(allow=true){
  const commit=vi.fn(),reset=vi.fn()
  const h=renderHook(()=>useScheduleDrag({enabled:true,onDragStart:()=>allow,onDragCommit:commit,reset,
    dateAt:(x,y)=>y<0 ? null : toOrdinal('2026-11-01')+Math.floor(x/28)}))
  const start=()=>act(()=>h.result.current.begin({button:0,isPrimary:true,pointerId:1,clientX:14,clientY:20,stopPropagation(){},preventDefault(){}} as never,original,'end'))
  return {...h,commit,reset,start}
}
it('previews without mutation and commits exactly once on release',()=>{
  const h=setup();h.start()
  act(()=>pointer('pointermove',70))
  expect(h.result.current.preview?.endDate).toBe('2026-11-03');expect(h.commit).not.toHaveBeenCalled()
  act(()=>{pointer('pointerup',70);pointer('pointerup',70)})
  expect(h.commit).toHaveBeenCalledTimes(1)
  expect(h.commit).toHaveBeenCalledWith(original,{startDate:'2026-11-01',endDate:'2026-11-03'})
})
it.each(['escape','outside','cancel','blur'])('cancels %s and clears preview without saving',kind=>{
  const h=setup();h.start();act(()=>pointer('pointermove',70))
  act(()=>{
    if(kind==='escape')window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))
    if(kind==='outside')pointer('pointerup',70,-1)
    if(kind==='cancel')pointer('pointercancel',70)
    if(kind==='blur')window.dispatchEvent(new Event('blur'))
  })
  expect(h.commit).not.toHaveBeenCalled();expect(h.result.current.preview).toBeNull();expect(h.reset).toHaveBeenCalled()
})
it('does not mutate for dirty editor or an ordinary click',()=>{
  const h=setup(false);h.start();act(()=>{pointer('pointermove',70);pointer('pointerup',70)})
  expect(h.commit).not.toHaveBeenCalled();expect(h.result.current.preview).toBeNull()
  h.start();act(()=>pointer('pointerup',14));expect(h.commit).not.toHaveBeenCalled()
})
