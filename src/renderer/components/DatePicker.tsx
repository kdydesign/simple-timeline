import { useState, useRef } from 'react'
import { calendarGrid } from '../../visualization/calendar'
import { parseBusinessDate, shiftMonth } from '../../domain/date'
import {Popover} from './Popover'
import {Select} from './Select'
import {IconButton} from './Icon'
import type { YearMonth } from '../../shared/types'
function monthOf(value: string): YearMonth {
  try { parseBusinessDate(value); return {year:Number(value.slice(0,4)), month:Number(value.slice(5,7))} }
  catch { const d=new Date(); return {year:d.getFullYear(),month:d.getMonth()+1} }
}
export function DatePicker({id, label, value, onChange, invalid}: {
  id: string; label: string; value: string; onChange:(v:string)=>void; invalid?: boolean
}) {
  const [open,setOpen]=useState(false), [month,setMonth]=useState(()=>monthOf(value))
  const [yearText,setYearText]=useState(String(month.year))
  const now=new Date(), today=`${String(now.getFullYear()).padStart(4,'0')}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
  const input=useRef<HTMLInputElement>(null),anchor=useRef<HTMLDivElement>(null)
  const show=()=>{const m=monthOf(value);setMonth(m);setYearText(String(m.year));setOpen(true)}
  const navigate=(m:YearMonth)=>{setMonth(m);setYearText(String(m.year))}
  const close=(restore=true)=>{setOpen(false);if(restore)input.current?.focus()}
  return <div className="date-picker" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false)}}
    onKeyDown={e=>{if(open && e.key==='Escape'){e.stopPropagation();close()}}}>
    <div ref={anchor} className="date-input"><input ref={input} id={id} placeholder="YYYY-MM-DD" value={value}
      aria-invalid={invalid || undefined} aria-describedby={invalid ? 'form-error' : undefined}
      aria-expanded={open} aria-controls={`${id}-calendar`}
      onClick={show} onChange={e=>onChange(e.target.value)} onKeyDown={e=>{if(e.altKey && e.key==='ArrowDown'){e.preventDefault();show()}}}/>
      <IconButton icon="calendar" label={`${label} 달력 열기`} onClick={()=>open ? close() : show()}/></div>
    {open && <Popover anchor={anchor} onClose={close} id={`${id}-calendar`} className="date-popover" label={`${label} 달력`} width={296}>
      <div className="picker-navigation">
        <IconButton icon="left" label="달력 이전 달" disabled={!shiftMonth(month,-1)} onClick={()=>navigate(shiftMonth(month,-1)!)}/>
        <input aria-label="달력 연도" type="number" min="1" max="9999" value={yearText} onBlur={()=>setYearText(String(month.year))} onChange={e=>{setYearText(e.target.value);const y=Number(e.target.value);if(Number.isInteger(y)&&y>=1&&y<=9999)setMonth({...month,year:y})}}/>
        <Select label="달력 월" value={String(month.month)} onChange={v=>setMonth({...month,month:Number(v)})}
          options={Array.from({length:12},(_,i)=>({value:String(i+1),label:`${i+1}월`}))}/>
        <IconButton icon="right" label="달력 다음 달" disabled={!shiftMonth(month,1)} onClick={()=>navigate(shiftMonth(month,1)!)}/>
      </div>
      <div className="picker-grid">{['월','화','수','목','금','토','일'].map(d=><span key={d}>{d}</span>)}
        {calendarGrid(month).weeks.flat().map((d,i)=>d ? <button type="button" key={d} aria-label={d}
          aria-current={d===today ? "date" : undefined} aria-pressed={d===value} className={Number(d.slice(5,7))===month.month ? '' : 'adjacent-date'}
          onClick={()=>{onChange(d);close()}}>{Number(d.slice(8))}</button> : <span key={`empty:${i}`}/>)}</div>
      <button type="button" onClick={()=>close()}>달력 닫기</button>
    </Popover>}
  </div>
}
