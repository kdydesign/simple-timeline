import { useState, useRef } from 'react'
import { calendarGrid } from '../../visualization/calendar'
import { parseBusinessDate, shiftMonth } from '../../domain/date'
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
  const input=useRef<HTMLInputElement>(null)
  const show=()=>{const m=monthOf(value);setMonth(m);setYearText(String(m.year));setOpen(true)}
  const navigate=(m:YearMonth)=>{setMonth(m);setYearText(String(m.year))}
  const close=()=>{setOpen(false);input.current?.focus()}
  return <div className="date-picker" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false)}}
    onKeyDown={e=>{if(open && e.key==='Escape'){e.stopPropagation();close()}}}>
    <div className="date-input"><input ref={input} id={id} placeholder="YYYY-MM-DD" value={value}
      aria-invalid={invalid || undefined} aria-describedby={invalid ? 'form-error' : undefined}
      aria-expanded={open} aria-controls={`${id}-calendar`}
      onClick={show} onChange={e=>onChange(e.target.value)} onKeyDown={e=>{if(e.altKey && e.key==='ArrowDown'){e.preventDefault();show()}}}/>
      <button type="button" aria-label={`${label} 달력 열기`} onClick={()=>open ? close() : show()}>▦</button></div>
    {open && <div id={`${id}-calendar`} className="date-popover" role="group" aria-label={`${label} 달력`}>
      <div className="picker-navigation">
        <button type="button" aria-label="달력 이전 달" disabled={!shiftMonth(month,-1)} onClick={()=>navigate(shiftMonth(month,-1)!)}>‹</button>
        <input aria-label="달력 연도" type="number" min="1" max="9999" value={yearText} onBlur={()=>setYearText(String(month.year))} onChange={e=>{setYearText(e.target.value);const y=Number(e.target.value);if(Number.isInteger(y)&&y>=1&&y<=9999)setMonth({...month,year:y})}}/>
        <select aria-label="달력 월" value={month.month} onChange={e=>setMonth({...month,month:Number(e.target.value)})}>
          {Array.from({length:12},(_,i)=><option key={i} value={i+1}>{i+1}월</option>)}</select>
        <button type="button" aria-label="달력 다음 달" disabled={!shiftMonth(month,1)} onClick={()=>navigate(shiftMonth(month,1)!)}>›</button>
      </div>
      <div className="picker-grid">{['월','화','수','목','금','토','일'].map(d=><span key={d}>{d}</span>)}
        {calendarGrid(month).weeks.flat().map((d,i)=>d ? <button type="button" key={d} aria-label={d}
          aria-pressed={d===value} className={Number(d.slice(5,7))===month.month ? '' : 'adjacent-date'}
          onClick={()=>{onChange(d);close()}}>{Number(d.slice(8))}</button> : <span key={`empty:${i}`}/>)}</div>
      <button type="button" onClick={close}>달력 닫기</button>
    </div>}
  </div>
}
