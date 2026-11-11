import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import type {ReminderSettings,Result,Schedule} from '../../shared/types'
import {DEFAULT_REMINDER,normalizeReminder} from '../../domain/reminder'
import {DomainValidationError} from '../../domain/error'
import {ReminderFields} from './ReminderFields'
import {IconButton} from './Icon'
import {Button} from './ui/button'
import {trapTab} from './ConfirmDialog'

export function QuickReminder({schedule,caller,disabled,busy,covered,onClose,onGuard,onSave,onRefresh}:{
 schedule:Schedule|undefined;caller:HTMLElement;disabled:boolean;busy:boolean;covered:boolean;
 onClose:()=>void;onRefresh:()=>void;onGuard:(dirty:boolean)=>void;onSave:(value:ReminderSettings)=>Promise<Result<Schedule>>
}) {
 const original=useRef(schedule?.reminder??DEFAULT_REMINDER)
 const [draft,setDraft]=useState(original.current),[errors,setErrors]=useState<Record<string,string>>({}),[submitted,setSubmitted]=useState(false)
 const [error,setError]=useState(''),[saved,setSaved]=useState(false)
 const panel=useRef<HTMLDivElement>(null)
 const [position,setPosition]=useState({left:16,top:64})
 const dirty=!saved&&JSON.stringify(draft)!==JSON.stringify(original.current)
 useLayoutEffect(()=>{onGuard(dirty)},[dirty,onGuard])
 useEffect(()=>()=>onGuard(false),[onGuard])
 useLayoutEffect(()=>{
  const place=()=>{const b=caller.getBoundingClientRect();const height=panel.current?.offsetHeight??360;
   setPosition({left:Math.max(8,Math.min(b.left,window.innerWidth-356)),top:Math.max(56,Math.min(b.bottom+8,window.innerHeight-height-8))})}
  place();window.addEventListener('resize',place);return()=>window.removeEventListener('resize',place)
 },[caller])
 useEffect(()=>{panel.current?.querySelector<HTMLInputElement>('input')?.focus()},[])
 // Do not dismiss until the save shield and its focus restoration have finished.
 useEffect(()=>{if(saved&&!busy)onClose()},[saved,busy,onClose])
 const validate=(value:ReminderSettings)=>{
  const next:Record<string,string>={}
  if(!Number.isInteger(value.daysBefore)||value.daysBefore<0||value.daysBefore>365)next.daysBefore='알림은 0~365일 전의 정수로 입력해 주세요.'
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time))next.reminderTime='알림 시각은 00:00~23:59로 입력해 주세요.'
  if(schedule)try{normalizeReminder(value,schedule.startDate,schedule.endDate)}catch(e){if(e instanceof DomainValidationError&&!next[e.field])next[e.field]=e.message}
  return next
 }
 const save=async()=>{
  if(disabled||!schedule||saved)return
  const next=validate(draft);setSubmitted(true);setErrors(next);setError('')
  if(Object.keys(next).length){document.getElementById(`quick-${Object.keys(next)[0]}`)?.focus();return}
  const result=await onSave(draft)
  if(result.ok){setSaved(true);onGuard(false)}
  else if(result.error.code==='VALIDATION_ERROR'&&result.error.field)setErrors({[result.error.field]:result.error.message})
  else setError(result.error.message)
 }
 return <div className="quick-reminder-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget&&!busy&&!covered)onClose()}}>
  <div ref={panel} className="quick-reminder-popup" role="dialog" aria-modal="true" aria-label="알림 설정" style={position} inert={covered} aria-hidden={covered}
   onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(!busy)onClose()}else trapTab(e,e.currentTarget)}}>
   <div className="quick-reminder-heading"><h2>알림 설정</h2><IconButton icon="close" label="알림 설정 닫기" disabled={busy} onClick={onClose}/></div>
   <p className="quick-reminder-schedule">{schedule?.name??'삭제되거나 공유가 해제된 일정'}</p>
   {!schedule&&<p role="alert">더 이상 사용할 수 없는 일정입니다. 알림을 저장할 수 없습니다.</p>}
   <fieldset disabled={disabled||!schedule||saved}>
    <ReminderFields idPrefix="quick" value={draft} errors={errors} error={null} onChange={value=>{setDraft(value);setError('');if(submitted)setErrors(validate(value))}}/>
   </fieldset>
   {error&&<p role="alert">{error}</p>}
   {disabled&&!busy&&<Button onClick={onRefresh}>다시 조회</Button>}
   <div className="editor-actions"><Button onClick={onClose} disabled={busy}>취소</Button><Button className="primary" disabled={disabled||!schedule||saved} onClick={()=>void save()}>저장</Button></div>
  </div>
 </div>
}
