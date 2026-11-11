import {useEffect,useId,useRef,useState} from 'react'
import type {ApiError,Result} from '../../shared/types'
import type {ApprovedDevice} from '../../shared/sharing'
import {normalizeIPv4} from '../../domain/sharing'
import {Button} from './ui/button'
import {Input} from './ui/input'
import {IconButton} from './Icon'

type Errors=Partial<Record<'name'|'ip',string>>
export function SharingDeviceForm({device,devices,disabled,onSave,onRevoke,onDelete,onDirty}:{device?:ApprovedDevice;devices:ApprovedDevice[];disabled:boolean;onSave:(name:string,ip:string)=>Promise<Result<ApprovedDevice>>;onRevoke?:()=>void;onDelete?:()=>void;onDirty:(dirty:boolean)=>void}) {
 const [name,setName]=useState(device?.name??''),[ip,setIp]=useState(device?.ip??''),[submitted,setSubmitted]=useState(false),[serverError,setServerError]=useState<ApiError|null>(null)
 const prefix=useId(),form=useRef<HTMLFormElement>(null)
 const dirty=name!==(device?.name??'')||ip!==(device?.ip??'')
 useEffect(()=>{onDirty(dirty);return()=>onDirty(false)},[dirty])
 const invalid:Errors={}
 {
  if(!name.trim())invalid.name='참여자 이름을 입력해 주세요.'
  try{
   const normalized=normalizeIPv4(ip)
   if(devices.some(d=>d.id!==device?.id&&!d.revoked&&d.ip===normalized))invalid.ip='이미 등록된 IP입니다. 다른 참여자의 IP를 입력해 주세요.'
  }catch{invalid.ip='올바른 IPv4 주소를 입력해 주세요. 예: 192.168.0.20'}
 }
 const errors:Errors=submitted?{...invalid,...(serverError?{[serverError.field==='name'?'name':'ip']:serverError.message}:{})}:{}
 const submit=()=>{
  setSubmitted(true);setServerError(null)
  if(Object.keys(invalid).length){form.current?.querySelector<HTMLInputElement>(invalid.name?'[data-device-name]':'[data-device-ip]')?.focus();return}
  void onSave(name.trim(),ip.trim()).then(result=>{
   if(result.ok){setSubmitted(false);setName(device?result.data.name:'');setIp(device?result.data.ip:'')}
   else if(result.error.code==='VALIDATION_ERROR'&&['name','ip','address'].includes(result.error.field??'')){
    setServerError(result.error);requestAnimationFrame(()=>form.current?.querySelector<HTMLInputElement>(result.error.field==='name'?'[data-device-name]':'[data-device-ip]')?.focus())
   }
  })
 }
 return <form ref={form} className={`sharing-device ${device?'':'sharing-device-new'}`} noValidate onSubmit={e=>{e.preventDefault();submit()}}>
  {!device&&<h4>새 참여자</h4>}
  <div className="sharing-device-row">
  <div className="sharing-device-inputs">
   <label htmlFor={`${prefix}-name`}><span className="sharing-device-label">이름</span><Input id={`${prefix}-name`} data-device-name aria-label={device?`${device.name} 이름`:'새 참여자 이름'} value={name} onChange={e=>{setName(e.target.value);setServerError(null)}} placeholder="참여자 이름" disabled={disabled||device?.revoked} aria-invalid={!!errors.name} aria-describedby={errors.name?`${prefix}-name-error`:undefined}/>{errors.name&&<p id={`${prefix}-name-error`} className="field-error" role="alert">{errors.name}</p>}</label>
   <label htmlFor={`${prefix}-ip`}><span className="sharing-device-label">IP 주소</span><Input id={`${prefix}-ip`} data-device-ip aria-label={device?`${device.name} IP`:'새 참여자 IP'} value={ip} onChange={e=>{setIp(e.target.value);setServerError(null)}} placeholder="192.168.0.20" disabled={disabled||device?.revoked} aria-invalid={!!errors.ip} aria-describedby={errors.ip?`${prefix}-ip-error`:undefined}/>{errors.ip&&<p id={`${prefix}-ip-error`} className="field-error" role="alert">{errors.ip}</p>}</label>
  </div>
  {device&&<span className="sharing-badge sharing-device-status" aria-label={device.revoked?'승인 취소됨':device.approved?'승인됨':'연결 승인 대기'}>{device.revoked?'승인 취소':device.approved?'승인':'승인 대기'}</span>}
   <div className="sharing-device-actions">
    <Button type="submit" disabled={disabled||!!device?.revoked||(!dirty&&!!device)}>{device?'수정':'등록'}</Button>
    {onRevoke&&<Button type="button" disabled={disabled||device?.revoked} onClick={onRevoke}>승인 취소</Button>}
    {onDelete&&<IconButton icon="trash" className="danger" label={`${device?.name} 참여자 삭제`} disabled={disabled} onClick={onDelete}/>}
   </div>
  </div>
 </form>
}
