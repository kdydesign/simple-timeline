import {useEffect,useId,useRef,useState} from 'react'
import type {HolidayCalendar,HolidayState} from '../../shared/holidays'
import type {Result} from '../../shared/types'
import {validateHolidayCalendar} from '../../domain/holidays'
import {DomainValidationError} from '../../domain/error'
import {Button} from './ui/button'
import {Input} from './ui/input'
import {DatePicker} from './DatePicker'
import {localDate} from '../state/dateNavigation'
export function HolidaySettings({state,host,busy,onSave,onDirty,source='common'}:{source?:'common'|'personal';state:HolidayState;host:boolean;busy:boolean;onSave:(calendar:HolidayCalendar)=>Promise<Result<unknown>>;onDirty:(dirty:boolean)=>void}){
 const scope=source==='personal'?'개인':'공통'
 const [baseline,setBaseline]=useState(()=>({date:localDate(new Date()),endDate:localDate(new Date()),name:''}))
 const id=useId(),[weekdays,setWeekdays]=useState(state.calendar.weekdays),[date,setDate]=useState(baseline.date),[endDate,setEndDate]=useState(baseline.endDate),[name,setName]=useState(''),[editing,setEditing]=useState<string|null>(null)
 const [errors,setErrors]=useState<Record<string,string>>({}),[notice,setNotice]=useState('')
 const weeklyDirty=JSON.stringify([...weekdays].sort())!==JSON.stringify([...state.calendar.weekdays].sort())
 const dirty=host&&(weeklyDirty||date!==baseline.date||endDate!==baseline.endDate||name!==baseline.name),guard=useRef(onDirty);guard.current=onDirty
 useEffect(()=>{guard.current(dirty)},[dirty]);useEffect(()=>()=>guard.current(false),[])
 // Polls may refresh status every two seconds. Never reinitialize a local draft.
 const previous=useRef(JSON.stringify(state.calendar.weekdays))
 useEffect(()=>{const next=JSON.stringify(state.calendar.weekdays);if(previous.current!==next){if(JSON.stringify([...weekdays].sort())===JSON.stringify(JSON.parse(previous.current).sort()))setWeekdays(state.calendar.weekdays);previous.current=next}},[state.calendar.weekdays,weekdays])
 const resetDraft=()=>{const today=localDate(new Date());setBaseline({date:today,endDate:today,name:''});setDate(today);setEndDate(today);setName('');setEditing(null);setErrors({})}
 const input=useRef<HTMLDivElement>(null)
 const save=async(calendar:HolidayCalendar,reset=false)=>{
  setErrors({});setNotice('')
  let normalized:HolidayCalendar
  try{normalized=validateHolidayCalendar(calendar)}catch(e){const field=e instanceof DomainValidationError?e.field:'dates';setErrors({[field]:(e as Error).message});requestAnimationFrame(()=>input.current?.querySelector<HTMLInputElement>(field==='date'?'[data-holiday-start] input':field==='endDate'?'[data-holiday-end] input':'[data-holiday-name]')?.focus());return}
  const result=await onSave(normalized)
  if(!result.ok){if(result.error.code==='VALIDATION_ERROR')setErrors({[result.error.field??'dates']:result.error.message});else setErrors({dates:result.error.message});return}
  setNotice('휴일표를 저장했습니다.')
  if(reset)resetDraft()
 }
 const status=holidayStatusDescription(state)
 return <section className="holiday-settings" aria-label={`휴일 관리 (${scope})`}>
  <div className="holiday-section-title"><h3>휴일 관리 ({scope})</h3><span className="help">{source==='personal'?'이 PC에만 적용':host?'호스트 공통 휴일표':'호스트 제공 · 조회 전용'}</span></div>
  <p className="help">{source==='personal'?'이 PC에만 적용되며 다른 PC에 공유되지 않습니다. 공통 휴일과 겹친 날짜는 한 번만 제외합니다.':host?'승인된 모든 멤버에게 동기화됩니다. 휴일 변경 알림은 보내지 않습니다.':'호스트가 설정한 휴일을 간트와 달력에 표시합니다.'}</p>
  {status&&<p className="help" role="status">{status}</p>}
  {!host&&state.lastReceivedAt&&<p className="help">마지막 수신: {new Date(state.lastReceivedAt).toLocaleString('ko-KR')}</p>}
  <div className="holiday-sections"><fieldset className="holiday-repeat" disabled={busy}><legend>반복 휴일</legend><p className="help">매주 반복되는 휴무 요일</p><div className="holiday-weekdays">{[1,2,3,4,5,6,0].map(day=>!host?<span className="holiday-weekday-label" key={day} data-active={state.calendar.weekdays.includes(day)}>{['일','월','화','수','목','금','토'][day]}<span className="sr-only">{state.calendar.weekdays.includes(day)?'요일 휴일':'요일 휴일 아님'}</span></span>:<Button type="button" key={day} aria-label={`${['일','월','화','수','목','금','토'][day]}요일 휴일`} aria-pressed={(host?weekdays:state.calendar.weekdays).includes(day)} onClick={()=>{setWeekdays(v=>v.includes(day)?v.filter(d=>d!==day):[...v,day]);setNotice('')}}>{['일','월','화','수','목','금','토'][day]}</Button>)}{host&&<Button type="button" disabled={!weeklyDirty} onClick={()=>void save({...state.calendar,weekdays})}>반복 요일 저장</Button>}</div>
  {errors.weekdays&&<p className="field-error" role="alert">{errors.weekdays}</p>}
  </fieldset>
  <fieldset className="holiday-dated" disabled={busy} aria-labelledby={`${id}-dated-title`}><legend><h4 id={`${id}-dated-title`}>날짜별 휴일 ({scope})</h4></legend><p className="help">특정 날짜 또는 기간에만 적용</p>
  <table className="holiday-table"><thead><tr><th scope="col">기간</th><th scope="col">휴일 이름</th>{host&&<th scope="col"><span className="sr-only">관리</span></th>}</tr></thead><tbody>{state.calendar.dates.map(h=><tr key={h.date}><td><time dateTime={h.date}>{h.date}</time>{h.endDate&&<> ~ <time dateTime={h.endDate}>{h.endDate}</time></>}</td><td>{h.name}</td>{host&&<td><div className="holiday-actions"><Button type="button" disabled={busy} aria-label={`${h.name} 휴일 수정`} onClick={()=>{setEditing(h.date);setBaseline({date:h.date,endDate:h.endDate??h.date,name:h.name});setDate(h.date);setEndDate(h.endDate??h.date);setName(h.name);setErrors({});setNotice('')}}>수정</Button><Button type="button" className="danger" aria-label={`${h.name} 휴일 삭제`} disabled={busy} onClick={()=>void save({...state.calendar,dates:state.calendar.dates.filter(d=>d.date!==h.date)},editing===h.date)}>삭제</Button></div></td>}</tr>)}</tbody></table>
  {!state.calendar.dates.length&&<p className="help">등록된 날짜별 휴일이 없습니다.</p>}
  {host&&<div className="holiday-form" ref={input}>
   <div className="schedule-date-field" data-holiday-start><label htmlFor={`${id}-date`}>시작일</label><DatePicker id={`${id}-date`} label="시작일" value={date} onChange={v=>{setDate(v);setErrors(e=>({...e,date:''}))}} invalid={!!errors.date} describedBy={errors.date?`${id}-date-error`:undefined}/>{errors.date&&<p id={`${id}-date-error`} className="field-error" role="alert">{errors.date}</p>}</div>
   <div className="schedule-date-field" data-holiday-end><label htmlFor={`${id}-end`}>종료일</label><DatePicker id={`${id}-end`} label="종료일" value={endDate} onChange={v=>{setEndDate(v);setErrors(e=>({...e,endDate:''}))}} invalid={!!errors.endDate} describedBy={errors.endDate?`${id}-end-error`:undefined}/>{errors.endDate&&<p id={`${id}-end-error`} className="field-error" role="alert">{errors.endDate}</p>}</div>
   <div><label htmlFor={`${id}-name`}>휴일 이름</label><Input data-holiday-name id={`${id}-name`} value={name} maxLength={100} placeholder="예: 사내 휴무일" aria-invalid={!!errors.name} aria-describedby={errors.name?`${id}-name-error`:undefined} onChange={e=>{setName(e.target.value);setErrors(v=>({...v,name:''}))}}/>{errors.name&&<p id={`${id}-name-error`} className="field-error" role="alert">{errors.name}</p>}</div>
   <div className="holiday-actions"><Button type="button" onClick={resetDraft}>취소</Button><Button type="button" className="primary" onClick={()=>void save({...state.calendar,dates:[...state.calendar.dates.filter(h=>h.date!==editing),{date,endDate,name}]},true)}>{editing?'휴일 저장':'휴일 추가'}</Button></div>
  </div>}
  {errors.dates&&<p className="field-error" role="alert">{errors.dates}</p>}
  </fieldset></div>
  {notice&&<p className="help" role="status">{notice}</p>}
 </section>
}
export function holidayStatusDescription(state?:HolidayState):string{
 if(!state)return ''
 if(state.status==='stale')return '휴일표는 마지막 수신 기준입니다. 재연결하면 갱신됩니다.'
 if(state.status==='pending')return '휴일표 수신 전입니다. 기본 토·일을 표시합니다.'
 if(state.status==='error'||state.status==='unsupported'||state.status==='revoked')return state.message
 return ''
}
