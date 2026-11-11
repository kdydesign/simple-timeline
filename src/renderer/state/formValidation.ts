import type {Editor} from './useEditor'
import type {Project} from '../../shared/types'
import {normalizeName,normalizeColor,normalizeParticipants,validateId} from '../../domain/normalize'
import {parseBusinessDate,inclusiveDays,toOrdinal} from '../../domain/date'
import {DEFAULT_REMINDER} from '../../domain/reminder'
export type FieldErrors=Record<string,string>
export function validateEditor(model:Editor,projects:Project[]):FieldErrors {
 const errors:FieldErrors={};
 const check=(key:string,run:()=>unknown)=>{try{run()}catch(e){errors[key]=e instanceof Error?e.message:'입력값을 확인해 주세요.'}}
 if(model.sharing!=='member')check('name',()=>normalizeName(model.draft.name));
 if(model.kind==='project'){
  if(model.sharing==='member')return errors;
  check('color',()=>normalizeColor(model.draft.color));check('participants',()=>normalizeParticipants(model.draft.participants));
  if(model.draft.shared){const seen=new Set<string>();model.draft.participants.forEach((name,i)=>{const normalized=name.trim();if(!normalized||seen.has(normalized))return;seen.add(normalized);if(!model.draft.recipientIds?.[i])errors[`recipient-${i}`]='공유할 PC를 선택해 주세요.'})}
 }else{
  if(model.sharing!=='member'){
   if(!model.id)check('projectId',()=>{validateId(model.draft.projectId,'projectId');if(!projects.some(p=>p.id===model.draft.projectId&&p.sharing!=='member'))throw Error('소속 프로젝트를 선택해 주세요.')});
   check('startDate',()=>parseBusinessDate(model.draft.startDate,'startDate'));check('endDate',()=>parseBusinessDate(model.draft.endDate,'endDate'));
   if(!errors.startDate&&!errors.endDate)check('endDate',()=>inclusiveDays(model.draft.startDate,model.draft.endDate));
  }
  const r=model.draft.reminder??DEFAULT_REMINDER;
  if(!Number.isInteger(r.daysBefore)||r.daysBefore<0||r.daysBefore>365)errors.daysBefore='알림은 0~365일 전의 정수로 입력해 주세요.';
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time))errors.reminderTime='알림 시각은 00:00~23:59로 입력해 주세요.';
  if(!errors.daysBefore){for(const key of ['start','end'] as const){if(!r[key])continue;try{if(toOrdinal(model.draft[`${key}Date`])-r.daysBefore<1)errors.daysBefore='알림 날짜가 0001-01-01 이전입니다. 알림 설정을 먼저 조정해 주세요.'}catch{/* Invalid source date is already reported; independent reminder fields remain validated. */}}}
 }
 return errors;
}
export function fieldId(key:string){return key==='color'?'editor-color-code':key==='projectId'?'editor-project':key.startsWith('recipient-')||key.startsWith('participant-')?key:`editor-${key}`}
