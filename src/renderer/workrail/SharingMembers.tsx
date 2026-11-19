import { useEffect, useRef, useState } from 'react'
import { Popover } from 'radix-ui'
import type { SharingState } from '../../shared/sharing'
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip'

export const sharingRoles = { personal: '개인 전용', host: '호스트', member: '멤버' } as const

export function connectedMembers(sharing: SharingState | null) {
  if (sharing?.role !== 'host' || sharing.status !== 'connected') return []
  return sharing.devices.filter(device => device.approved && !device.revoked && sharing.memberPresence?.[device.id]?.connected)
    .map(device => ({ id: device.id, name: device.name, version: sharing.deviceVersions?.[device.id]?.version ?? null }))
}

type ConnectedMember = ReturnType<typeof connectedMembers>[number]

function MemberName({ name }: { name: string }) {
  return <Tooltip>
    <TooltipTrigger asChild><span className="workrail-member-name" tabIndex={0}>{name}</span></TooltipTrigger>
    <TooltipContent className="app-tooltip workrail-member-tooltip" collisionPadding={8}>{name}</TooltipContent>
  </Tooltip>
}

function versionLabel(version: string | null) {
  return version ? '버전 ' + version : '버전 확인 불가'
}

function MemberVersion({ version, footer }: { version: string | null; footer: boolean }) {
  const label = versionLabel(version)
  return <Tooltip>
    <TooltipTrigger asChild><span className="workrail-member-version" tabIndex={0}>
      {footer && '('}<span>{label}</span>{footer && ')'}
    </span></TooltipTrigger>
    <TooltipContent className="app-tooltip workrail-member-tooltip" collisionPadding={8}>{label}</TooltipContent>
  </Tooltip>
}

export function SharingMembers({ members, footer = false }: { members: ConnectedMember[]; footer?: boolean }) {
  const container = useRef<HTMLDivElement>(null)
  const [footerWidth, setFooterWidth] = useState<number | null>(null)
  useEffect(() => {
    const element = container.current
    if (!footer || !element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => setFooterWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [footer])
  // Reserve enough space for each name and its version, and the overflow button when needed.
  const memberWidth = 185
  const moreWidth = 50
  const limit = !footer || footerWidth === null ? 2 : members.length * memberWidth <= footerWidth ? members.length
    : Math.max(0, Math.floor((footerWidth - moreWidth) / memberWidth))
  const overflow = members.length - limit
  return <div ref={container} className={footer ? 'planrail-members' : 'workrail-widget-members'}>
    {!members.length && <span className="workrail-muted">연결된 참여자 없음</span>}
    {!!members.length && limit > 0 && <ul aria-label="연결된 참여자">
      {members.slice(0, limit).map(member => <li key={member.id}>
        <MemberName name={member.name} />
        <MemberVersion version={member.version} footer={footer} />
        {!footer && <span className="workrail-member-connected">연결됨</span>}
      </li>)}
    </ul>}
    {overflow > 0 && <Popover.Root>
      <Popover.Trigger type="button" className="workrail-control workrail-member-more">외 {overflow}명</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="workrail-member-popover" aria-label="연결된 참여자" side={footer ? 'top' : 'bottom'}
          align="end" sideOffset={6} collisionPadding={8}>
          <strong>연결된 참여자</strong>
          <ul>{members.map(member => <li key={member.id}>
            <span>{member.name}</span><span>{versionLabel(member.version)}</span><span className="workrail-member-connected">연결됨</span>
          </li>)}</ul>
          <Popover.Close type="button" className="workrail-control">닫기</Popover.Close>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>}
  </div>
}
