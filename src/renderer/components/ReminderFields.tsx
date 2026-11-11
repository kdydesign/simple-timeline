import type {ReminderSettings,ApiError} from '../../shared/types'
import {DEFAULT_REMINDER} from '../../domain/reminder'
import {Input} from './ui/input'
import {Switch} from './ui/switch'
export function ReminderFields({value=DEFAULT_REMINDER,onChange,error,errors={},idPrefix="editor"}:{value?:ReminderSettings;onChange:(value:ReminderSettings)=>void;error:ApiError|null;errors?:Record<string,string>;idPrefix?:string}) {
 return <section className="reminder-fields" aria-labelledby={`${idPrefix}-reminder-heading`}>
  <h3 id={`${idPrefix}-reminder-heading`}>알림</h3>
  <div className="reminder-inputs">
   <label htmlFor={`${idPrefix}-daysBefore`}>며칠 전<div className="reminder-days"><Input id={`${idPrefix}-daysBefore`} aria-label="알림 며칠 전" type="number" min={0} max={365} step={1} value={Number.isFinite(value.daysBefore)?value.daysBefore:''} aria-invalid={!!errors.daysBefore} aria-describedby={errors.daysBefore?`${idPrefix}-daysBefore-error`:undefined} onChange={e=>onChange({...value,daysBefore:e.target.value===''?NaN:Number(e.target.value)})}/><span>일 전</span></div>{errors.daysBefore&&<p className="field-error" id={`${idPrefix}-daysBefore-error`} role="alert">{errors.daysBefore}</p>}</label>
   <label htmlFor={`${idPrefix}-reminderTime`}>알림 시각<Input id={`${idPrefix}-reminderTime`} aria-label="알림 시각" type="text" inputMode="numeric" placeholder="HH:mm" maxLength={5} value={value.time} aria-invalid={!!errors.reminderTime} aria-describedby={errors.reminderTime?`${idPrefix}-reminderTime-error`:undefined} onChange={e=>onChange({...value,time:e.target.value})}/>{errors.reminderTime&&<p className="field-error" id={`${idPrefix}-reminderTime-error`} role="alert">{errors.reminderTime}</p>}</label>
  </div>
  <div className="reminder-options">
   <label htmlFor={`${idPrefix}-reminderStart`}><Switch id={`${idPrefix}-reminderStart`} checked={value.start} onCheckedChange={start=>onChange({...value,start})}/>시작일 알림</label>
   <label htmlFor={`${idPrefix}-reminderEnd`}><Switch id={`${idPrefix}-reminderEnd`} checked={value.end} onCheckedChange={end=>onChange({...value,end})}/>종료일 알림</label>
  </div>
 </section>
}
