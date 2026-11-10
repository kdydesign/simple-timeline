import {sharingDescription} from '../../shared/sharing-status'
import {useEffect,useState} from 'react'
import type {SharingApi,SharingState,ApprovedDevice} from '../../shared/sharing'
import type {ApiError,Project,Result} from '../../shared/types'
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription} from './ui/alert-dialog'
import {Button} from './ui/button'
import {Input} from './ui/input'
import {Select} from './Select'
import {ConfirmDialog} from './ConfirmDialog'
type Run=<T>(operation:()=>Promise<Result<T>>)=>Promise<Result<T>>
type Ask=(title:string,message:string,label:string,run:()=>void)=>void
function DeviceForm({device,disabled,onSave,onRevoke,onDirty}:{device?:ApprovedDevice;disabled:boolean;onSave:(name:string,ip:string)=>Promise<boolean>;onRevoke?:()=>void;onDirty:(dirty:boolean)=>void}) {
 const [name,setName]=useState(device?.name??''),[ip,setIp]=useState(device?.ip??'');
 const dirty=name!==(device?.name??'')||ip!==(device?.ip??'');useEffect(()=>{onDirty(dirty);return()=>onDirty(false)},[dirty]);
 return <form className="sharing-device" onSubmit={e=>{e.preventDefault();void onSave(name,ip).then(ok=>{if(ok&&!device){setName('');setIp('')}})}}>
 <Input aria-label={device?`${device.name} 이름`:'새 참여자 이름'} value={name} onChange={e=>setName(e.target.value)} disabled={disabled}/>
 <Input aria-label={device?`${device.name} IP`:'새 참여자 IP'} value={ip} onChange={e=>setIp(e.target.value)} placeholder="192.168.0.20" disabled={disabled}/>
 <Button type="submit" disabled={disabled||!dirty}>{device?'수정':'등록'}</Button>{onRevoke&&<Button type="button" disabled={disabled||device?.revoked} onClick={onRevoke}>승인 취소</Button>}
 <small>{device&&(device.revoked?'승인 취소됨':device.approved?'승인됨':'연결 승인 대기')}</small>
 </form>
}
export function SharingSettings({state,api,busy,error,projects,run,onClose,onGuard}:{state:SharingState;api:SharingApi;busy:boolean;error:ApiError|null;projects:Project[];run:Run;onClose:()=>void;onGuard:(dirty:boolean)=>void}) {
 const [address,setAddress]=useState(state.address??''),[port,setPort]=useState(String(state.port)),[choice,setChoice]=useState<'host'|'member'>(state.role==='host'||state.roleHistory==='host'?'host':'member'),[savedAddress,setSavedAddress]=useState({address:state.address??'',port:String(state.port)}),[dirtyDevices,setDirtyDevices]=useState<Record<string,boolean>>({}),[confirmation,setConfirmation]=useState<{title:string;message:string;label:string;run:()=>void}|null>(null);
 const dirty=address!==savedAddress.address||port!==savedAddress.port||Object.values(dirtyDevices).some(Boolean);
 useEffect(()=>{onGuard(dirty);return()=>onGuard(false)},[dirty,onGuard]);
 const ask:Ask=(title,message,label,action)=>setConfirmation({title,message,label,run:()=>{setConfirmation(null);action()}});
 const close=()=>{if(busy)return;if(dirty)ask('설정 변경을 버릴까요?','저장하지 않은 공유 설정 입력이 사라집니다. 기존 일정 편집은 유지됩니다.','변경 버리기',onClose);else onClose()};
 const affected=(id:string)=>state.projects.filter(p=>p.participants.some(v=>v.deviceId===id)).map(p=>projects.find(v=>v.id===p.id)?.name??p.id).join(', ')||'없음';
 const saveAddress=async()=>{const result=await run(()=>state.role==='host'||(state.role==='personal'&&choice==='host')?api.configureHost({address,port:Number(port)}):api.connect({address,port:Number(port)}));if(result.ok)setSavedAddress({address,port})};
 return <><AlertDialog open><AlertDialogContent role="dialog" className="sharing-settings" onEscapeKeyDown={e=>{e.preventDefault();e.stopPropagation();close()}} onCloseAutoFocus={e=>e.preventDefault()}>
 <div className="editor-title"><AlertDialogTitle>공유 설정</AlertDialogTitle><Button type="button" disabled={busy} aria-label="공유 설정 닫기" onClick={close}>닫기</Button></div>
 <AlertDialogDescription>같은 사내망에서 프로젝트를 공유합니다. 개인 일정은 이 PC에 보관합니다.</AlertDialogDescription>
 <div className="sharing-settings-scroll">
 <p role="status">{state.role==='host'?'호스트':state.role==='member'?'멤버':'개인 전용'} · {sharingDescription(state)}</p>
 {error&&<p role="alert">{error.message}</p>}{state.cleanupPending&&<p role="alert">연결 정보 삭제가 끝나지 않았습니다. 파일 접근을 확인하고 연결 해제를 다시 시도해 주세요.</p>}
 <p className="help">이 PC의 IP: {state.availableAddresses.join(', ')||'사용 가능한 IPv4 주소 없음'}</p>
 {!state.cleanupPending&&<fieldset disabled={busy}>
 {state.role==='personal'&&<div className="sharing-role"><Button type="button" disabled={state.roleHistory==='member'} aria-pressed={choice==='host'} onClick={()=>setChoice('host')}>호스트로 공유</Button><Button type="button" disabled={state.roleHistory==='host'} aria-pressed={choice==='member'} onClick={()=>setChoice('member')}>멤버로 연결</Button></div>}
 <form onSubmit={e=>{e.preventDefault();void saveAddress()}}>
 <label htmlFor="sharing-address">{state.role==='host'||(state.role==='personal'&&choice==='host')?'공유할 LAN IP':'호스트 IP'}</label>
 {state.role==='host'||(state.role==='personal'&&choice==='host')?<Select id="sharing-address" label="공유할 LAN IP" value={address} onChange={setAddress} options={[...state.availableAddresses].sort((a,b)=>Number(a.startsWith('127.'))-Number(b.startsWith('127.'))).map(ip=>({value:ip,label:ip.startsWith('127.')?`${ip} · 이 PC에서만 사용`:ip}))}/>:<Input id="sharing-address" value={address} onChange={e=>setAddress(e.target.value)} placeholder="192.168.0.10"/>}
 <label htmlFor="sharing-port">포트</label><Input id="sharing-port" value={port} type="number" min={1} max={65535} onChange={e=>setPort(e.target.value)}/>
 <Button type="submit">{state.role==='host'||(state.role==='personal'&&choice==='host')?'호스트 주소 저장':'연결'}</Button>
 </form>
 {state.role==='host'&&<Button type="button" onClick={()=>void run(()=>api.setHosting({enabled:!state.hostingEnabled}))}>{state.hostingEnabled?'공유 중지':'공유 시작'}</Button>}
 </fieldset>}
 {state.pendingPair&&<section><h3>호스트 확인</h3><p>호스트 화면의 전체 지문과 일치하는지 확인하세요.</p><code className="sharing-fingerprint">{state.pendingPair.fingerprint}</code><p>만료: {state.pendingPair.expiresAt}</p><Button type="button" disabled={busy} onClick={()=>void run(()=>api.confirmHost({pairId:state.pendingPair!.pairId,confirmed:true}))}>전체 지문 일치 확인</Button></section>}
 {state.role==='host'&&<><section><h3>참여자 이름 · IP</h3><p className="help">공유 프로젝트의 참여자에 연결할 PC를 등록하세요.</p>
 {state.devices.map(device=><DeviceForm key={device.id} device={device} disabled={busy} onDirty={value=>setDirtyDevices(v=>v[device.id]===value?v:{...v,[device.id]:value})} onSave={(name,ip)=>new Promise(resolve=>{const save=()=>void run(()=>api.saveDevice({id:device.id,name,ip})).then(r=>resolve(r.ok));if(ip!==device.ip)ask('참여자 IP를 수정할까요?',`영향받는 공유 프로젝트: ${affected(device.id)}. 기존 PC는 새 IP로 승인된 요청만 허용됩니다.`,'IP 수정',save);else save()})} onRevoke={()=>ask('이 PC의 승인을 취소할까요?',`영향받는 공유 프로젝트: ${affected(device.id)}. 이 PC는 더 이상 공유 자료를 받을 수 없습니다.`,'승인 취소',()=>void run(()=>api.revokeDevice({id:device.id})))}/>)}
 <DeviceForm disabled={busy} onDirty={value=>setDirtyDevices(v=>v.new===value?v:{...v,new:value})} onSave={async(name,ip)=>(await run(()=>api.saveDevice({name,ip}))).ok}/>
 </section><section><h3>연결 승인</h3>{!state.pendingPairs.length&&<p className="help">승인 대기 중인 PC가 없습니다.</p>}{state.pendingPairs.map(pair=><div key={pair.pairId}><p>{pair.name} · {pair.ip}</p><code className="sharing-fingerprint">{pair.fingerprint}</code><p>만료: {pair.expiresAt}</p><Button type="button" disabled={busy} onClick={()=>ask('전체 지문을 확인했나요?','멤버 화면의 전체 지문이 일치할 때만 승인하세요.','일치 확인 후 승인',()=>void run(()=>api.approve({pairId:pair.pairId,confirmed:true})))}>지문 확인 · 연결 승인</Button></div>)}</section></>}
 {(state.role==='member'||state.cleanupPending)&&<Button type="button" className="danger" disabled={busy} onClick={()=>ask('연결을 해제할까요?','공유 캐시와 이 PC의 공유 알림·접속 정보를 삭제합니다. 개인 일정은 유지합니다.','연결 해제',()=>void run(()=>api.disconnect({confirmed:true})))}>{state.cleanupPending?'연결 해제 다시 시도':'연결 해제'}</Button>}
 </div></AlertDialogContent></AlertDialog>
 {confirmation&&<ConfirmDialog title={confirmation.title} message={confirmation.message} confirmLabel={confirmation.label} onConfirm={confirmation.run} onCancel={()=>setConfirmation(null)}/>}</>
}
