import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { wheelPixels, zoomAt } from '../../visualization/ganttNavigation'
interface Options {
  root:RefObject<HTMLElement|null>
  dateArea:RefObject<HTMLDivElement|null>
  active:boolean
  offset:number
  dayWidth:number
  days:number
  viewport:number
  move:(offset:number,dayWidth?:number)=>void
  onDayWidth?: (width:number)=>void
  isScheduleDragging:()=>boolean
}
const editable = (target:EventTarget|null) => target instanceof Element && !!target.closest('input,textarea,select,[contenteditable="true"],[role="combobox"],[role="listbox"]')
export function useGanttNavigation(options:Options) {
  const latest=useRef(options), suppress=useRef(false)
  const [panning,setPanning]=useState(false)
  useLayoutEffect(()=>{latest.current=options})
  useEffect(()=>{
    let space=false
    let session:{pointer:number;x:number;offset:number;moved:boolean}|null=null
    const finish=()=>{session=null;setPanning(false)}
    const dates=(event:MouseEvent)=>{
      const target=event.target
      if(!(target instanceof Element))return false
      if(target.closest('.gantt-track,.gantt-date-heading'))return true
      const area=latest.current.dateArea.current?.getBoundingClientRect()
      return !!area && !!target.closest('.gantt-body') && !target.closest('.gantt-name') && event.clientX>=area.left && event.clientX<area.right
    }
    const down=(event:PointerEvent)=>{
      suppress.current=false
      const o=latest.current
      if(!space || !o.active || o.isScheduleDragging() || !dates(event) || event.button!==0 || !event.isPrimary)return
      event.preventDefault();event.stopPropagation()
      session={pointer:event.pointerId,x:event.clientX,offset:o.offset,moved:false}
      suppress.current=true
      setPanning(true)
    }
    const move=(event:PointerEvent)=>{
      if(!session || event.pointerId!==session.pointer)return
      event.preventDefault()
      const dx=event.clientX-session.x
      if(!session.moved && Math.abs(dx)<4)return
      session.moved=true
      latest.current.move(session.offset-dx)
    }
    const up=(event:PointerEvent)=>{if(event.pointerId===session?.pointer)finish()}
    const blur=()=>{space=false;finish()}
    const keydown=(event:KeyboardEvent)=>{
      if(!session && event.key==='Enter')suppress.current=false
      if(event.key==='Escape' && session){event.preventDefault();event.stopImmediatePropagation();finish();return}
      if(event.code!=='Space' && event.key!==' ')return
      if(editable(event.target))return
      if(!space && !session)suppress.current=false
      space=true
      // Ordinary button activation is preserved until a pointer gesture starts.
      if(session)event.preventDefault()
    }
    const keyup=(event:KeyboardEvent)=>{
      if(event.code!=='Space' && event.key!==' ')return
      space=false
      if(suppress.current && !editable(event.target))event.preventDefault()
      finish()
    }
    const wheel=(event:WheelEvent)=>{
      const o=latest.current
      if(!o.active || !(event.target instanceof Element))return
      if(event.ctrlKey ? !dates(event) : !event.target.closest('.gantt-body,.gantt-date-heading'))return
      const area=o.dateArea.current?.getBoundingClientRect()
      if(!area)return
      if(event.ctrlKey){
        event.preventDefault()
        if(o.isScheduleDragging() || session || !o.onDayWidth)return
        const next=zoomAt(o.dayWidth,o.offset,event.clientX-area.left,wheelPixels(event.deltaY,event.deltaMode,o.viewport),o.days)
        o.move(next.offset,next.dayWidth);o.onDayWidth(next.dayWidth)
      }else if(event.deltaX || event.shiftKey){
        event.preventDefault()
        o.move(o.offset+wheelPixels(event.deltaX || event.deltaY,event.deltaMode,o.viewport))
      }
    }
    const root=options.root.current
    root?.addEventListener('pointerdown',down,true)
    root?.addEventListener('wheel',wheel,{passive:false})
    window.addEventListener('pointermove',move,{passive:false})
    window.addEventListener('pointerup',up)
    window.addEventListener('pointercancel',up)
    window.addEventListener('blur',blur)
    window.addEventListener('keydown',keydown,true)
    window.addEventListener('keyup',keyup,true)
    return()=>{
      root?.removeEventListener('pointerdown',down,true)
      root?.removeEventListener('wheel',wheel)
      window.removeEventListener('pointermove',move)
      window.removeEventListener('pointerup',up)
      window.removeEventListener('pointercancel',up)
      window.removeEventListener('blur',blur)
      window.removeEventListener('keydown',keydown,true)
      window.removeEventListener('keyup',keyup,true)
    }
  },[])
  return {panning,consumeClick:()=>suppress.current}
}
