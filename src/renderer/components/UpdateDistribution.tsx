import type {UpdatesView} from '../state/useUpdates'
import {Button} from './ui/button'
import {updateBytes,updateErrors} from './UpdatePopover'
export function UpdateDistribution({updates,disabled=false}:{updates:UpdatesView;disabled?:boolean}){
 const s=updates.state,h=s?.host,locked=disabled||updates.busy||!!h?.importing
 return <section className="update-distribution"><h3>업데이트 배포</h3>
 <p className="help">호스트와 같은 버전의 Planrail-LAN-UPDATE ZIP을 가져온 뒤 배포를 시작하세요.</p>
 {updates.error&&<p role="alert">{updates.error}</p>}{s?.error&&<p role="alert">{updateErrors[s.error]}</p>}
 {!s&&!updates.error&&<p role="status">업데이트 상태 확인 중</p>}
 {h&&<><dl className="update-distribution-summary" aria-label="업데이트 배포 현황">
 <div><dt>현재 배포</dt><dd>{h.publishing?h.currentVersion:'없음'}</dd></div>
 <div><dt>보관 파일</dt><dd>{h.currentVersion??'없음'}{!h.publishing&&h.currentVersion?' · 배포 중지됨':''}</dd></div>
 <div><dt>배포 후보</dt><dd>{h.candidateVersion?`${h.candidateVersion} · ${updateBytes(h.candidateBytes)}`:'없음'}</dd></div>
 <div><dt>상태</dt><dd role="status">{h.importing?'ZIP 검사·가져오기 중':!s.connected?'공유 시작 후 배포할 수 있습니다.':h.publishing?'배포 중':h.canPublish?'배포 시작 가능':'배포 파일을 가져오세요.'}</dd></div>
 </dl>
 <div className="update-actions"><Button disabled={locked} onClick={()=>void updates.run('importBundle')}>업데이트 ZIP 가져오기</Button>
 <Button disabled={locked||!h.canPublish||!s.connected} onClick={()=>void updates.run('publish')}>배포 시작</Button>
 <Button disabled={locked||!h.publishing} onClick={()=>void updates.run('withdraw')}>배포 중지</Button></div></>}
 </section>
}
