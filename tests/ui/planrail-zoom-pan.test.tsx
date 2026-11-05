import { afterEach, it, expect, vi } from 'vitest'
import { act, render, fireEvent, screen } from '@testing-library/react'
import { useState } from 'react'
import { GanttView } from '../../src/renderer/components/GanttView'
import { usePreferences } from '../../src/renderer/state/usePreferences'
import { hotfix } from '../fixtures/timeline'
afterEach(()=>localStorage.clear())
function pointer(target:EventTarget,type:string,x:number,y=100) {
  const event=new Event(type,{bubbles:true,cancelable:true})
  Object.assign(event,{clientX:x,clientY:y,pointerId:1,button:0,isPrimary:true})
  act(()=>target.dispatchEvent(event))
}
function setup(width=28, persisted=false) {
  const edit=vi.fn(),commit=vi.fn(),add=vi.fn()
  function View() {
    const [widthValue,setWidth]=useState(width), prefs=usePreferences()
    return <><input aria-label="ordinary input"/><GanttView snapshot={hotfix} selectedMonth={{year:2026,month:12}}
      selectedDate="2026-12-01" dayWidth={persisted?prefs.dayWidth:widthValue} onDayWidth={persisted?prefs.setDayWidth:setWidth}
      onEditProject={()=>{}} onEditSchedule={edit} onAddSchedule={()=>{}} onAddDate={add} onDragCommit={commit}/></>
  }
  const view=render(<View/>), area=view.container.querySelector('.gantt-date-heading')!, body=view.container.querySelector('.gantt-body')!
  vi.spyOn(area,'getBoundingClientRect').mockReturnValue({left:0,right:1000,top:0,bottom:60,width:1000,height:60} as DOMRect)
  vi.spyOn(body,'getBoundingClientRect').mockReturnValue({left:0,right:1260,top:60,bottom:500,width:1260,height:440} as DOMRect)
  const slider=screen.getByRole('slider') as HTMLInputElement
  const tick=()=>view.container.querySelector<HTMLElement>('[data-day="2026-12-18"]')!
  return {...view,area,body,slider,tick,edit,commit,add}
}
it.each([14,28,84])('anchors a logical date under the pointer for Ctrl-wheel at %ipx',width=>{
  const v=setup(width), before=Number(v.slider.value)
  fireEvent.wheel(v.area,{ctrlKey:true,clientX:100,deltaY:width===84?100:-100})
  const afterWidth=parseFloat(v.tick().style.width)
  expect(afterWidth).not.toBe(width)
  expect((Number(v.slider.value)+100)/afterWidth).toBeCloseTo((before+100)/width,6)
})
it('normalizes wheel line/page units and leaves non-date/name areas unchanged',()=>{
  const v=setup()
  fireEvent.wheel(v.area,{ctrlKey:true,clientX:100,deltaY:-1,deltaMode:1})
  const lineWidth=parseFloat(v.tick().style.width)
  expect(lineWidth).toBeGreaterThan(28)
  fireEvent.wheel(v.container.querySelector('.gantt-name')!,{ctrlKey:true,deltaY:-500})
  expect(parseFloat(v.tick().style.width)).toBe(lineWidth)
  fireEvent.wheel(v.area,{ctrlKey:true,clientX:100,deltaY:-1,deltaMode:2})
  expect(parseFloat(v.tick().style.width)).toBeGreaterThan(lineWidth)
})
it.each([null,0,13,85,'42','corrupt'])('falls back to 28px for invalid persisted zoom %s',dayWidth=>{
  localStorage.setItem('simple-timeline.preferences.v1',JSON.stringify({theme:'dark',collapsed:['2'],dayWidth}))
  const v=setup(28,true)
  expect(v.tick().style.width).toBe('28px')
  fireEvent.wheel(v.area,{ctrlKey:true,clientX:100,deltaY:-100})
  const saved=JSON.parse(localStorage.getItem('simple-timeline.preferences.v1')!)
  expect(saved.dayWidth).toBeGreaterThan(28);expect(saved.theme).toBe('dark');expect(saved.collapsed).toEqual(['2'])
})
it.each(['pointerup','pointercancel','blur','Escape','Spaceup'])('pans over a previously focused bar, ends on %s at current offset and does not edit/save/add',end=>{
  const v=setup(), bar=v.container.querySelector<HTMLElement>('[data-bar="3"]')!
  bar.focus();fireEvent.keyDown(bar,{key:' ',code:'Space'})
  pointer(bar,'pointerdown',500)
  pointer(window,'pointermove',450)
  expect(Number(v.slider.value)).toBe(890)
  if(end==='Escape') fireEvent.keyDown(window,{key:'Escape'})
  else if(end==='Spaceup') fireEvent.keyUp(window,{key:' ',code:'Space'})
  else if(end==='blur') fireEvent(window,new Event('blur'))
  else pointer(window,end,450)
  pointer(window,'pointermove',400);pointer(window,'pointerup',400)
  fireEvent.click(bar)
  expect(Number(v.slider.value)).toBe(890)
  expect(v.edit).not.toHaveBeenCalled();expect(v.commit).not.toHaveBeenCalled();expect(v.add).not.toHaveBeenCalled()
})
it('bounds pan without range expansion and keeps ordinary input Space and armed schedule drags intact',()=>{
  const v=setup(),track=v.container.querySelector('.gantt-track')!,bar=v.container.querySelector('[data-bar="3"]')!
  const range=v.container.querySelector('[data-range]')!.textContent
  fireEvent.keyDown(window,{key:' ',code:'Space'});pointer(track,'pointerdown',500)
  pointer(window,'pointermove',5000);expect(v.slider.value).toBe('0')
  pointer(window,'pointermove',-5000);expect(v.slider.value).toBe(v.slider.max)
  pointer(window,'pointerup',-5000);fireEvent.keyUp(window,{key:' ',code:'Space'})
  expect(v.container.querySelector('[data-range]')).toHaveTextContent(range!)
  const input=screen.getByLabelText('ordinary input');input.focus()
  const key=new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true})
  fireEvent(input,key);expect(key.defaultPrevented).toBe(false)
  fireEvent.change(v.slider,{target:{value:840}})
  pointer(v.container.querySelector('[data-bar="3"]')!,'pointerdown',500)
  const width=v.tick().style.width
  fireEvent.wheel(v.area,{ctrlKey:true,clientX:100,deltaY:-100})
  expect(v.tick().style.width).toBe(width)
  fireEvent.keyDown(window,{key:' ',code:'Space'});pointer(window,'pointermove',528);pointer(window,'pointerup',528)
  expect(v.commit).toHaveBeenCalledTimes(1)
})
it('uses 14px dates for body hit testing and one-day end resize',()=>{
  const v=setup(14), track=v.container.querySelector('.gantt-track')!
  fireEvent.click(track,{clientX:35})
  expect(v.add).toHaveBeenCalledWith('2026-12-03','1')
  const handle=v.container.querySelector('[data-bar="3"] [data-resize="end"]')!
  pointer(handle,'pointerdown',245);pointer(window,'pointermove',259);pointer(window,'pointerup',259)
  expect(v.commit).toHaveBeenCalledWith(expect.objectContaining({id:'3'}),{startDate:'2026-12-18',endDate:'2026-12-19'})
})
it('preserves horizontal wheel over blank body space and zooms only its date portion',()=>{
  const v=setup()
  fireEvent.wheel(v.body,{clientX:200,deltaX:80})
  expect(v.slider.value).toBe('920')
  fireEvent.wheel(v.body,{clientX:200,ctrlKey:true,deltaY:-100})
  expect(parseFloat(v.tick().style.width)).toBeGreaterThan(28)
})
it('allows a fresh Enter activation after the Space pan gesture has finished',()=>{
  const v=setup(),bar=v.container.querySelector<HTMLElement>('[data-bar="3"]')!
  bar.focus();fireEvent.keyDown(bar,{key:' ',code:'Space'})
  pointer(bar,'pointerdown',500);pointer(window,'pointermove',450);pointer(window,'pointerup',450)
  fireEvent.keyUp(bar,{key:' ',code:'Space'})
  fireEvent.keyDown(bar,{key:'Enter'});fireEvent.click(bar)
  expect(v.edit).toHaveBeenCalledTimes(1)
})
it('returns focus to the persistent name when zoom removes the focused bar from view',()=>{
  const v=setup(),bar=v.container.querySelector<HTMLElement>('[data-bar="3"]')!
  bar.focus()
  fireEvent.wheel(v.area,{ctrlKey:true,clientX:0,deltaY:-1000})
  expect(screen.getByRole('button',{name:'운영 배포 편집'})).toHaveFocus()
  expect(v.container.querySelector('[data-bar="3"]')).toBeNull()
})
