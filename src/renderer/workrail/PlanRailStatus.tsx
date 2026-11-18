import type {SharingState} from '../../shared/sharing'
import {sharingDescription} from '../../shared/sharing-status'
import {Icon} from '../components/Icon'
import {Tooltip,TooltipTrigger,TooltipContent,TooltipProvider} from '../components/ui/tooltip'

export function PlanRailStatus({sharing,muted,loading}:{sharing:SharingState|null;muted:boolean|null;loading:boolean}){
 const connected=sharing?.status==='connected'&&(sharing.role==='host'||sharing.role==='member')
 const policy=loading?'loading':muted===null?'unknown':muted?'muted':'on'
 const label=policy==='loading'?'알림 상태 확인 중':policy==='unknown'?'알림 상태 확인 불가':policy==='muted'?'전체 알림 무음':'일정 알림 켜짐'
 return <TooltipProvider><footer className="planrail-status" aria-label="PlanRail 상태">
  <span className="sharing-badge">{sharing?.role==='host'?'호스트':sharing?.role==='member'?'멤버':sharing?'개인 전용':'역할 확인 불가'}</span>
  <Tooltip><TooltipTrigger asChild><span tabIndex={0} className="planrail-connection" data-connected={!!connected} aria-label={`공유 연결 상태: ${sharing?sharingDescription(sharing):'공유 상태 확인 불가'} · 마지막 정상 확인: ${sharing?.lastCheckedAt??'없음'}`}>
   {connected?<Icon name="connection"/>:<span className="connection-unknown" aria-hidden="true">!</span>}
   {sharing?sharingDescription(sharing):'공유 상태 확인 불가'}
  </span></TooltipTrigger><TooltipContent>마지막 정상 확인: {sharing?.lastCheckedAt??'없음'}</TooltipContent></Tooltip>
  <Tooltip><TooltipTrigger asChild><span tabIndex={0} className="planrail-policy" data-testid="notification-policy" data-policy={policy} aria-label={label}>
   <span className="policy-icon"><Icon name="bell"/>{policy==='muted'&&<svg data-muted-mark viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18"/></svg>}</span>{label}
  </span></TooltipTrigger><TooltipContent>앱 전체 무음 설정입니다. 개별 일정 설정이나 Windows 알림 수신 여부를 보장하지 않습니다.</TooltipContent></Tooltip>
 </footer></TooltipProvider>
}
