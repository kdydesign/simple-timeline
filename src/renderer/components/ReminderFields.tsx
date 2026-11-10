import type {ReminderSettings,ApiError} from '../../shared/types'
import {DEFAULT_REMINDER} from '../../domain/reminder'
import {Input} from './ui/input'
import {Switch} from './ui/switch'
export function ReminderFields({value=DEFAULT_REMINDER,onChange,error}:{value?:ReminderSettings;onChange:(value:ReminderSettings)=>void;error:ApiError|null}) {
 return <section className="reminder-fields" aria-labelledby="reminder-heading">
  <h3 id="reminder-heading">알림</h3>
  <div className="reminder-inputs">
   <label htmlFor="editor-daysBefore">며칠 전<div className="reminder-days"><Input id="editor-daysBefore" aria-label="알림 며칠 전" type="number" min={0} max={365} step={1} value={Number.isFinite(value.daysBefore)?value.daysBefore:''} aria-invalid={error?.field==='daysBefore'} onChange={e=>onChange({...value,daysBefore:e.target.value===''?NaN:Number(e.target.value)})}/><span>일 전</span></div></label>
   <label htmlFor="editor-reminderTime">알림 시각<Input id="editor-reminderTime" aria-label="알림 시각" type="text" inputMode="numeric" placeholder="HH:mm" maxLength={5} value={value.time} aria-invalid={error?.field==='reminderTime'} onChange={e=>onChange({...value,time:e.target.value})}/></label>
  </div>
  <div className="reminder-options">
   <label htmlFor="editor-reminderStart"><Switch id="editor-reminderStart" checked={value.start} onCheckedChange={start=>onChange({...value,start})}/>시작일 알림</label>
   <label htmlFor="editor-reminderEnd"><Switch id="editor-reminderEnd" checked={value.end} onCheckedChange={end=>onChange({...value,end})}/>종료일 알림</label>
  </div>
 </section>
}
