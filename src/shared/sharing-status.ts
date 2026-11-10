import type {SharingState} from './sharing'
const descriptions:Record<SharingState['status'],string>={personal:'공유 미설정',stopped:'공유 중지됨',connecting:'연결 확인 중',connected:'연결 정상',disconnected:'연결을 확인할 수 없습니다',pairing:'연결 승인 대기',revoked:'연결 승인 취소됨',error:'공유 연결 오류'}
export function sharingDescription(state:SharingState):string {
 return state.message|| (state.role==='host'&&state.status==='connected'?'공유 제공 중':descriptions[state.status])
}
// Pairing intent is visible before credential delivery commits the member role.
export function showMemberSharingControls(state:SharingState|null|undefined):boolean {
 return !!state&&(state.role==='member'||!!state.pendingPair||(state.role==='personal'&&state.status==='connecting'))
}
