import {DEFAULT_HOLIDAYS} from '../../shared/holidays'
import {HolidaySettings} from './HolidaySettings'
import {DormantSharingView} from './DormantSharingView'
import {UpdateDistribution} from './UpdateDistribution'
import {useUpdates} from '../state/useUpdates'
import {SharingDeviceForm} from './SharingDeviceForm'
import {IconButton} from './Icon'
import {sharingDescription} from '../../shared/sharing-status'
import {useEffect,useLayoutEffect,useState,useRef} from 'react'
import type {SharingApi,SharingState,ApprovedDevice} from '../../shared/sharing'
import type {ApiError,Project,Result} from '../../shared/types'
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription} from './ui/alert-dialog'
import {Button} from './ui/button'
import {Input} from './ui/input'
import {Switch} from './ui/switch'
import {Select} from './Select'
import {ConfirmDialog} from './ConfirmDialog'
import {restoreFocus} from '../state/restoreFocus'
type Run=<T>(operation:()=>Promise<Result<T>>)=>Promise<Result<T>>
type Ask=(title:string,message:string,label:string,run:()=>void)=>void
export function SharingSettings({state,api,busy,error,projects,run,onClose,onGuard,request,initialTab='basic',externalDirty=false}:{externalDirty?:boolean;request?:{token:string;approval:boolean}|null;initialTab?:'basic'|'sharing';state:SharingState;api:SharingApi;busy:boolean;error:ApiError|null;projects:Project[];run:Run;onClose:()=>void;onGuard:(dirty:boolean)=>void}) {
 const updates=useUpdates()
 const [switching,setSwitching]=useState(false),[roleChoices,setRoleChoices]=useState(false),[roleNotice,setRoleNotice]=useState(''),[dormant,setDormant]=useState(false)
 const roleRequest=useRef(false),dormantButton=useRef<HTMLButtonElement>(null)
 const previousSharingRole=state.role==='personal'?state.roleHistory:state.role
 const transition=state.roleTransition
 const transitionRunning=!!transition&&transition.phase!=='failed'
 const actionBusy=busy||switching||!!transition||updates.busy||!!updates.state?.host?.importing||!!updates.state?.editingBlocked
 const [tab,setTab]=useState<'basic'|'sharing'>(initialTab)
 useEffect(()=>{if(transition)setTab('sharing')},[transition?.target,transition?.phase])
 const [holidayDirty,setHolidayDirty]=useState(false),[personalDirty,setPersonalDirty]=useState(false)
 useEffect(()=>{if(request)setTab('sharing')},[request])
 const approvalAnchor=useRef<HTMLHeadingElement>(null)
 const consumedApproval=useRef<string|null>(null)
 useEffect(()=>{if(request?.approval&&tab==='sharing'&&consumedApproval.current!==request.token){consumedApproval.current=request.token;approvalAnchor.current?.scrollIntoView?.({block:'nearest'})}},[request,tab])
 const [deviceError,setDeviceError]=useState<ApiError|null>(null)
 const saveDevice=async(input:{id?:string;name:string;ip:string})=>{const result=await run(()=>api.saveDevice(input));setDeviceError(!result.ok&&result.error.code==='VALIDATION_ERROR'&&['name','ip','address'].includes(result.error.field??'')?result.error:null);return result}
 const [address,setAddress]=useState(state.address??''),[port,setPort]=useState(String(state.port)),[choice,setChoice]=useState<'host'|'member'>(state.role==='host'||state.roleHistory==='host'?'host':'member'),[savedAddress,setSavedAddress]=useState({address:state.address??'',port:String(state.port)}),[dirtyDevices,setDirtyDevices]=useState<Record<string,boolean>>({}),[confirmation,setConfirmation]=useState<{title:string;message:string;label:string;run:()=>void}|null>(null);
 const previousRole=useRef(state.role)
 useEffect(()=>{if(previousRole.current===state.role)return;previousRole.current=state.role;setAddress(state.address??'');setPort(String(state.port));setSavedAddress({address:state.address??'',port:String(state.port)});setRoleChoices(false);setDirtyDevices({});setDormant(false)},[state.role,state.address,state.port])
 const panel=useRef<HTMLDivElement>(null),returnTarget=useRef(document.activeElement as HTMLElement|null),confirmationCaller=useRef<HTMLElement|null>(null),returnFromConfirmation=useRef(false);
 const focusSetting=()=>{
  const root=panel.current;if(!root?.isConnected)return;
  const caller=confirmationCaller.current;
  const target=caller?.isConnected&&root.contains(caller)&&!caller.matches(':disabled')?caller:root.querySelector<HTMLElement>('.settings-tabs button[aria-selected="true"]');
  restoreFocus(target);
 };
 useEffect(()=>{
  if(confirmation||busy||switching||!returnFromConfirmation.current)return;
  returnFromConfirmation.current=false;
  const frame=requestAnimationFrame(focusSetting);return()=>cancelAnimationFrame(frame);
 },[confirmation,busy,switching]);
 const dismissConfirmation=()=>{returnFromConfirmation.current=true;setConfirmation(null)};
 const addressDirty=address!==savedAddress.address||port!==savedAddress.port
 const dirty=holidayDirty||personalDirty||addressDirty||Object.values(dirtyDevices).some(Boolean);
 useLayoutEffect(()=>{onGuard(dirty)},[dirty,onGuard]);
 useEffect(()=>()=>onGuard(false),[onGuard]);
 const ask:Ask=(title,message,label,action)=>{confirmationCaller.current=document.activeElement as HTMLElement|null;setConfirmation({title,message,label,run:()=>{dismissConfirmation();action()}})};
 const blockedReason=dirty||externalDirty?'미저장 변경이 있습니다. 먼저 변경 내용을 저장하거나 취소한 뒤 역할을 변경하세요.':actionBusy?'진행 중인 저장·업데이트·역할 전환이 끝난 뒤 다시 시도하세요.':state.cleanupPending?'연결 정보 정리를 먼저 완료한 뒤 역할을 변경하세요.':''
 const currentBlock=useRef(blockedReason);currentBlock.current=blockedReason
 const changeRole=async(role:'host'|'member',retry=false)=>{
  if(roleRequest.current)return
  if(!retry&&currentBlock.current){setRoleNotice(currentBlock.current);return}
  if(retry&&(busy||updates.busy||updates.state?.editingBlocked||dirty||externalDirty)){setRoleNotice('진행 중인 작업과 미저장 변경을 먼저 완료하세요.');return}
  roleRequest.current=true;setSwitching(true);setRoleNotice('')
  try{const result=await run(()=>api.switchRole({role,confirmed:true}));if(result.ok){setRoleChoices(false);setRoleNotice(`${role==='host'?'호스트':'멤버'}로 전환했습니다. ${role==='host'?'공유와 업데이트 배포는 중지 상태입니다.':'호스트 연결은 별도로 시작하세요.'}`)}else setRoleNotice(result.error.message)}catch{setRoleNotice('역할 전환 결과를 확인하지 못했습니다. 현재 상태를 확인한 뒤 다시 시도하세요.')}finally{roleRequest.current=false;setSwitching(false)}
 }
 const confirmRole=(role:'host'|'member')=>{
  if(currentBlock.current){setRoleNotice(currentBlock.current);return}
  ask(`${role==='host'?'호스트':'멤버'}로 전환할까요?`,role==='member'?'공유 제공과 업데이트 배포를 중지합니다. 호스트 원본·참여자·승인은 보관하며 중지된 공유 자료에서 조회만 가능합니다. 개인 자료는 유지됩니다. 멤버 연결과 지문 확인은 별도로 진행하세요.':'멤버 연결을 해제하고 수신 자료·공유 알림·접속 자격을 정리합니다. 다음 멤버 연결 시 재승인이 필요합니다. 개인 자료와 보관한 호스트 원본은 유지되며 공유와 업데이트 배포는 자동 시작하지 않습니다.','전환 확인',()=>void changeRole(role))
 }
 const close=()=>{if(!busy&&!switching&&!transitionRunning)onClose()};
 const escape=(event:KeyboardEvent)=>{
  // Radix hands off document capture listeners in a passive effect. A visible
  // confirmation must own Escape even while the parent's listener is still live.
  if(event.defaultPrevented)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(confirmation)dismissConfirmation();else close();
 };
 const affected=(id:string)=>state.projects.filter(p=>p.participants.some(v=>v.deviceId===id)).map(p=>projects.find(v=>v.id===p.id)?.name??p.id).join(', ')||'없음';
 const saveAddress=async()=>{const result=await run(()=>state.role==='host'||(state.role==='personal'&&choice==='host')?api.configureHost({address,port:Number(port)}):api.connect({address,port:Number(port)}));if(result.ok)setSavedAddress({address,port})};
 return <><AlertDialog open><AlertDialogContent ref={panel} role="dialog" className="sharing-settings sharing-settings-host" onOpenAutoFocus={e=>{e.preventDefault();const target=panel.current?.querySelector<HTMLElement>('.settings-tabs button[aria-selected="true"]');restoreFocus(target??panel.current)}} onEscapeKeyDown={escape} onCloseAutoFocus={e=>{
  e.preventDefault();
  const original=returnTarget.current;
  const target=original?.isConnected&&original.tabIndex>=0&&!original.closest('[inert],[hidden]')&&!original.matches(':disabled')?original:[...document.querySelectorAll<HTMLElement>('#editor-name,[aria-label="편집 닫기"],[data-focus="project-add"]')].find(el=>!el.closest('[inert],[hidden]')&&!el.matches(':disabled'));
  restoreFocus(target);
 }}>
 <div className="editor-title"><AlertDialogTitle>설정</AlertDialogTitle><IconButton icon="close" disabled={busy||switching||transitionRunning} label="설정 닫기" onClick={close}/></div>
 <AlertDialogDescription className="sharing-settings-description">같은 사내망에서 프로젝트를 공유합니다. 개인 일정은 이 PC에 보관합니다.</AlertDialogDescription>
 <div className="settings-tabs" role="tablist" aria-label="설정 종류">{(['basic','sharing'] as const).map(value=><Button key={value} id={`settings-tab-${value}`} role="tab" aria-controls={`settings-panel-${value}`} aria-selected={tab===value} onClick={()=>setTab(value)}>{value==='basic'?'기본 설정':'공유 설정'}</Button>)}</div>
 <div className="sharing-settings-scroll">
 <div id="settings-panel-basic" role="tabpanel" aria-labelledby="settings-tab-basic" hidden={tab!=='basic'}>
 {error&&tab==='basic'&&<p role="alert">{error.message}</p>}
 {state.role==='host'&&window.timelineUpdates&&<UpdateDistribution updates={updates} disabled={actionBusy}/>}
 {state.holidays&&state.role==='host'&&<HolidaySettings state={state.holidays} host busy={actionBusy} onDirty={setHolidayDirty} onSave={calendar=>run(()=>api.saveHolidays({calendar}))}/>}
 <HolidaySettings source="personal" state={{calendar:state.personalHolidays??DEFAULT_HOLIDAYS,status:'local',lastReceivedAt:null,message:''}} host busy={actionBusy} onDirty={setPersonalDirty} onSave={calendar=>run(()=>api.savePersonalHolidays({calendar}))}/>
 {state.holidays&&state.role==='member'&&<HolidaySettings state={state.holidays} host={false} busy={actionBusy} onDirty={()=>{}} onSave={async()=>({ok:false,error:{code:'FORBIDDEN',message:'조회 전용입니다.'}})}/>}
 </div><div id="settings-panel-sharing" role="tabpanel" aria-labelledby="settings-tab-sharing" hidden={tab!=='sharing'}>
 {dormant?<DormantSharingView api={api} onBack={()=>{setDormant(false);requestAnimationFrame(()=>restoreFocus(dormantButton.current))}}/>:<>
 <div className="sharing-role-summary"><p role="status">{state.role==='host'?'호스트':state.role==='member'||state.pendingPair?'멤버':'개인 전용'} · {sharingDescription(state)}</p>
 {previousSharingRole&&!transition&&<Button type="button" disabled={actionBusy} aria-expanded={roleChoices} onClick={()=>{if(blockedReason){setRoleNotice(blockedReason);return}setRoleNotice('');setRoleChoices(v=>!v)}}>역할 변경</Button>}</div>
 {roleChoices&&!transition&&<div className="sharing-role" aria-label="변경할 역할">{(['host','member'] as const).map(role=><Button key={role} type="button" disabled={actionBusy||previousSharingRole===role} onClick={()=>confirmRole(role)}>{role==='host'?'호스트':'멤버'}로 전환</Button>)}</div>}
 {roleNotice&&<p role="status">{roleNotice}</p>}
 {actionBusy&&!switching&&!transition&&<p className="help" role="status">진행 중인 저장·업데이트가 끝난 뒤 역할을 변경할 수 있습니다.</p>}
 {switching&&<p role="status">역할을 전환하고 있습니다. 공유 연결과 자료 정리가 끝날 때까지 기다려 주세요.</p>}
 {transition&&<section className="sharing-transition" aria-label="역할 전환 상태"><p role={transition.phase==='failed'?'alert':'status'}>{transition.phase==='failed'?'역할 전환이 완료되지 않았습니다. 공유와 연결은 중지 상태입니다. 파일 접근과 저장소 상태를 확인한 뒤 전환을 다시 시도하세요.':transition.phase==='stopping'?'공유와 연결을 중지하고 있습니다.':'이전 역할의 연결 정보와 알림을 정리하고 있습니다.'}</p>{transition.phase==='failed'&&<Button disabled={busy||switching||updates.busy} onClick={()=>void changeRole(transition.target,true)}>전환 다시 시도</Button>}</section>}
 {state.role==='member'&&state.dormantAvailable&&!transition&&<Button ref={dormantButton} type="button" disabled={actionBusy} onClick={()=>setDormant(true)}>중지된 공유 자료 조회</Button>}
 {state.deviceVersionError&&<p role="alert">멤버 버전 기록을 저장하지 못했습니다. 저장소를 확인해 주세요.</p>}
 {state.pairingNotificationError&&<p role="alert">연결 승인 요청 알림을 전달하지 못했습니다. 승인 대기 목록과 저장소를 확인하세요.</p>}
 {error&&tab==='sharing'&&error!==deviceError&&<p role="alert">{error.message}</p>}{state.cleanupPending&&!transition&&<p role="alert">연결 정보 삭제가 끝나지 않았습니다. 파일 접근을 확인하고 연결 해제를 다시 시도해 주세요.</p>}
 <p className="help">이 PC의 IP: {state.availableAddresses.join(', ')||'사용 가능한 IPv4 주소 없음'}</p>
 {!state.cleanupPending&&!transition&&<fieldset disabled={actionBusy}>
 {state.role==='personal'&&<div className="sharing-role"><Button type="button" disabled={state.roleHistory==='member'} aria-pressed={choice==='host'} onClick={()=>setChoice('host')}>호스트로 공유</Button><Button type="button" disabled={state.roleHistory==='host'} aria-pressed={choice==='member'} onClick={()=>setChoice('member')}>멤버로 연결</Button></div>}
 <form onSubmit={e=>{e.preventDefault();void saveAddress()}}>
 <label htmlFor="sharing-address">{state.role==='host'||(state.role==='personal'&&choice==='host')?'공유할 LAN IP':'호스트 IP'}</label>
 {state.role==='host'||(state.role==='personal'&&choice==='host')?<Select id="sharing-address" label="공유할 LAN IP" value={address} onChange={setAddress} options={[...state.availableAddresses].sort((a,b)=>Number(a.startsWith('127.'))-Number(b.startsWith('127.'))).map(ip=>({value:ip,label:ip.startsWith('127.')?`${ip} · 이 PC에서만 사용`:ip}))}/>:<Input id="sharing-address" value={address} onChange={e=>setAddress(e.target.value)} placeholder="192.168.0.10"/>}
 <label htmlFor="sharing-port">포트</label><Input id="sharing-port" value={port} type="number" min={1} max={65535} onChange={e=>setPort(e.target.value)}/>
 <div className="sharing-address-actions"><Button type="submit">{state.role==='host'||(state.role==='personal'&&choice==='host')?'호스트 주소 저장':'연결'}</Button>
 {state.role==='host'&&<Button type="button" disabled={!state.hostingEnabled&&addressDirty} onClick={()=>void run(()=>api.setHosting({enabled:!state.hostingEnabled}))}>{state.hostingEnabled?'공유 중지':'공유 시작'}</Button>}</div>
 {state.role==='host'&&addressDirty&&!state.hostingEnabled&&<p className="help sharing-address-hint">먼저 호스트 주소를 저장한 뒤 공유를 시작하세요.</p>}
 </form>
 </fieldset>}
 {state.pendingPair&&<section><h3>호스트 확인</h3><p>호스트 화면의 전체 지문과 일치하는지 확인하세요.</p><code className="sharing-fingerprint">{state.pendingPair.fingerprint}</code><p>만료: {state.pendingPair.expiresAt}</p><Button type="button" disabled={actionBusy} onClick={()=>void run(()=>api.confirmHost({pairId:state.pendingPair!.pairId,confirmed:true}))}>전체 지문 일치 확인</Button></section>}
 {state.role==='member'&&<section>
 <div className="reminder-options"><label htmlFor="sharing-change-notifications"><Switch className="reminder-switch" id="sharing-change-notifications" checked={state.changeNotifications?.enabled??true} disabled={actionBusy} onCheckedChange={enabled=>void run(()=>api.setChangeNotifications({enabled}))}/>공유 변경 알림</label></div>
 <p className="help">공유받은 프로젝트와 일정의 변경을 Windows 알림으로 받습니다.</p>
 {state.changeNotifications?.baselining&&<p role="status">다음 동기화부터 새 변경 알림을 받습니다.</p>}
 {state.changeNotifications?.supported===false&&<p role="status">변경 알림을 사용하려면 호스트와 멤버를 업데이트하세요.</p>}
 </section>}
 {state.role==='host'&&<><section><h3>참여자 이름 · IP <span className="sharing-badge">연결 {state.connectedMembers??0}대</span></h3><p className="help">공유 프로젝트의 참여자에 연결할 PC를 등록하세요.</p>
 {state.devices.map(device=><SharingDeviceForm devices={state.devices} key={device.id} device={device} presence={state.memberPresence?.[device.id]} version={state.deviceVersions?.[device.id]} disabled={actionBusy} onDirty={value=>setDirtyDevices(v=>v[device.id]===value?v:{...v,[device.id]:value})} onSave={(name,ip)=>new Promise<Result<ApprovedDevice>>(resolve=>{const save=()=>void saveDevice({id:device.id,name,ip}).then(resolve);if(ip!==device.ip)ask('참여자 IP를 수정할까요?',`영향받는 공유 프로젝트: ${affected(device.id)}. 기존 PC는 새 IP로 승인된 요청만 허용됩니다.`,'IP 수정',save);else save()})} onDelete={()=>ask('참여자를 삭제할까요?',`${device.name} (${device.ip})의 등록과 모든 공유 권한을 제거합니다. 영향받는 공유 프로젝트: ${affected(device.id)}. 프로젝트와 일정은 유지됩니다. 다시 연결하려면 재등록·승인이 필요합니다.`,'참여자 삭제',()=>void run(()=>api.deleteDevice({id:device.id})))} onRevoke={()=>ask('이 PC의 승인을 취소할까요?',`영향받는 공유 프로젝트: ${affected(device.id)}. 이 PC는 더 이상 공유 자료를 받을 수 없습니다.`,'승인 취소',()=>void run(()=>api.revokeDevice({id:device.id})))}/>)}
 <SharingDeviceForm devices={state.devices} disabled={actionBusy} onDirty={value=>setDirtyDevices(v=>v.new===value?v:{...v,new:value})} onSave={(name,ip)=>saveDevice({name,ip})}/>
 </section><section><h3 ref={approvalAnchor}>연결 승인</h3>{!state.pendingPairs.length&&<p className="help">승인 대기 중인 PC가 없습니다.</p>}{state.pendingPairs.map(pair=><div key={pair.pairId}><p>{pair.name} · {pair.ip}</p><code className="sharing-fingerprint">{pair.fingerprint}</code><p>만료: {pair.expiresAt}</p><Button type="button" disabled={actionBusy} onClick={()=>ask('전체 지문을 확인했나요?','멤버 화면의 전체 지문이 일치할 때만 승인하세요.','일치 확인 후 승인',()=>void run(()=>api.approve({pairId:pair.pairId,confirmed:true})))}>지문 확인 · 연결 승인</Button></div>)}</section></>}
 {!transition&&(state.role==='member'||state.cleanupPending)&&<Button type="button" className="danger" disabled={actionBusy} onClick={()=>ask('연결을 해제할까요?','공유 캐시와 이 PC의 공유 알림·접속 정보를 삭제합니다. 개인 일정은 유지합니다.','연결 해제',()=>void run(()=>api.disconnect({confirmed:true})))}>{state.cleanupPending?'연결 해제 다시 시도':'연결 해제'}</Button>}
 </>}
 </div></div></AlertDialogContent></AlertDialog>
 {confirmation&&<ConfirmDialog title={confirmation.title} message={confirmation.message} confirmLabel={confirmation.label} onConfirm={confirmation.run} onCancel={dismissConfirmation}/>}</>
}
