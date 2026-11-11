import type {UpdatesView} from '../state/useUpdates'
import {Button} from './ui/button'
import {updateBytes,updateErrors} from './UpdatePopover'
export function UpdateDistribution({updates}:{updates:UpdatesView}){
 const s=updates.state,h=s?.host
 return <section className="update-distribution"><h3>업데이트 배포</h3>
 <p className="help">호스트를 먼저 수동 업데이트한 뒤, 같은 버전의 Planrail-LAN-UPDATE ZIP을 가져오세요. 등록 후 배포 시작을 눌러 공개합니다.</p>
 {updates.error&&<p role="alert">{updates.error}</p>}{s?.error&&<p role="alert">{updateErrors[s.error]}</p>}
 {!s&&!updates.error&&<p role="status">업데이트 상태 확인 중</p>}
 {h&&<><p>현재 배포: {h.publishing?h.currentVersion:'없음'}</p>{!h.publishing&&h.currentVersion&&<p>보관 배포본: {h.currentVersion} · 배포 중지됨</p>}<p>등록 후보: {h.candidateVersion?`${h.candidateVersion} · ${updateBytes(h.candidateBytes)}`:'없음'}</p>
 {h.importing&&<p role="status">ZIP 검사·가져오기 중</p>}
 {!s.connected&&<p className="help">공유 시작 후 배포할 수 있습니다.</p>}
 <div className="update-actions"><Button disabled={updates.busy||h.importing} onClick={()=>void updates.run('importBundle')}>업데이트 ZIP 가져오기</Button>
 <Button disabled={updates.busy||!h.canPublish||!s.connected||h.importing} onClick={()=>void updates.run('publish')}>배포 시작</Button>
 <Button disabled={updates.busy||!h.publishing||h.importing} onClick={()=>void updates.run('withdraw')}>배포 중지</Button></div></>}
 </section>
}
