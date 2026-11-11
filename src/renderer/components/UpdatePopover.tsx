import {useRef,useState} from 'react'
import {Popover} from './Popover'
import {IconButton} from './Icon'
import {Button} from './ui/button'
import type {UpdatesView} from '../state/useUpdates'
import type {UpdateErrorCode} from '../../shared/updates'
export const updateErrors:Record<UpdateErrorCode,string>={
 'invalid-bundle':'업데이트 ZIP 검사에 실패했습니다. 올바른 CI 배포 파일을 선택해 주세요.',
 'host-mismatch':'호스트에 설치된 버전·소스와 같은 배포 파일이 필요합니다.',storage:'업데이트 파일을 저장하거나 정리하지 못했습니다. 디스크 공간과 파일 접근을 확인해 주세요.',network:'호스트 연결이 끊겼습니다. 연결 후 다시 시도해 주세요.',integrity:'파일 검증에 실패했습니다. 다시 다운로드해 주세요.',withdrawn:'호스트가 배포를 중지했습니다.',replaced:'배포 파일이 변경되었습니다. UPDATE를 다시 눌러 주세요.','trust-changed':'호스트 또는 연결 승인이 변경되어 업데이트를 취소했습니다.',unsupported:'이 PC에서는 업데이트 설치를 사용할 수 없습니다.',shutdown:'업데이트를 위한 앱 종료를 완료하지 못했습니다.',install:'설치를 완료하지 못했습니다. 현재 버전을 계속 사용하며 다시 시도할 수 있습니다.'}
export const updateBytes=(bytes:number)=>`${(bytes/1024/1024).toFixed(1)} MB`
export function UpdatePopover({updates,installBlocked=false}:{updates:UpdatesView;installBlocked?:boolean}){
 const [open,setOpen]=useState(false),anchor=useRef<HTMLSpanElement>(null),s=updates.state
 if(!s||s.role!=='member'||!s.version||s.phase==='idle')return null
 const disabled=!s.connected&&!s.canInstall&&!['downloading','verifying','installing'].includes(s.phase)
 const percent=s.totalBytes?Math.min(100,Math.round(s.receivedBytes/s.totalBytes*100)):0
 const close=(restore:boolean)=>{setOpen(false);if(restore)anchor.current?.querySelector('button')?.focus()}
 return <span className="update-anchor update-ui" ref={anchor}>
  <button type="button" className="update-trigger" disabled={disabled} aria-expanded={open} aria-controls="update-progress" title={disabled?'호스트 연결 후 다운로드할 수 있습니다.':undefined} onClick={()=>{setOpen(true);if(s.canDownload&&!updates.busy)void updates.run('download')}}>UPDATE</button>
  {open&&<Popover anchor={anchor} onClose={close} label="앱 업데이트" id="update-progress" className="update-popover" width={320}>
   <div className="update-heading"><h2>Planrail {s.version}</h2><IconButton icon="close" label="업데이트 진행 닫기" onClick={()=>close(true)}/></div>
   <p role="status">{s.phase==='downloading'?'업데이트 다운로드 중':s.phase==='verifying'?'다운로드 파일 검증 중':s.phase==='installing'?'설치 후 재시작 중':s.phase==='waiting'?'설치 준비 완료':s.phase==='error'?'업데이트를 완료하지 못했습니다.':'새 버전을 사용할 수 있습니다.'}</p>
   {['downloading','verifying'].includes(s.phase)&&<><progress max={100} value={percent} aria-label="업데이트 다운로드" aria-valuenow={percent}/><p>{updateBytes(s.receivedBytes)} / {updateBytes(s.totalBytes)} · {percent}%</p></>}
   {s.requiresExplicitInstall&&<p>입력을 저장하거나 정리한 뒤 ‘설치 후 재시작’을 눌러 주세요.</p>}
   {!s.connected&&s.canInstall&&<p>검증한 파일로 오프라인 설치할 수 있습니다.</p>}
   {(updates.error||s.error)&&<p role="alert">{updates.error??updateErrors[s.error!]}</p>}
   <div className="update-actions">{s.canCancel&&<Button onClick={()=>void updates.run('cancel')}>{s.phase==='waiting'?'업데이트 취소':'다운로드 취소'}</Button>}{s.canRetry&&<Button disabled={updates.busy} onClick={()=>void updates.run('retry')}>다시 시도</Button>}{s.canInstall&&<Button className="primary" disabled={updates.busy||s.editingBlocked||installBlocked} onClick={()=>void updates.run('install')}>설치 후 재시작</Button>}</div>
   {s.phase==='downloading'&&<p className="help">창을 닫아도 다운로드는 계속됩니다.</p>}
  </Popover>}
 </span>
}
