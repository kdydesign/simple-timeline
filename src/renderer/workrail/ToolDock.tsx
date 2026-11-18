import { CalendarDays, Hexagon, House } from 'lucide-react'
import type { Ref } from 'react'

const tools = [
  { id: 'home', label: '홈', Icon: House },
  { id: 'planrail', label: 'Planrail', Icon: CalendarDays },
  { id: 'node', label: 'Node 관리', Icon: Hexagon },
] as const

export type WorkRailTool = typeof tools[number]['id']

export function ToolDock({ current, blocked, onSelect, activeButton }: {
  current: WorkRailTool
  blocked: boolean
  onSelect: (tool: WorkRailTool) => void
  activeButton: Ref<HTMLButtonElement>
}) {
  return (
    <nav className="workrail-dock" aria-label="WorkRail 도구" aria-hidden={blocked || undefined} inert={blocked}>
      {tools.map(({ id, label, Icon }) => (
        <button key={id} type="button" className="workrail-control"
          ref={current === id ? activeButton : undefined}
          aria-current={current === id ? 'page' : undefined}
          aria-keyshortcuts={current === id ? 'F6' : undefined}
          disabled={blocked} onClick={() => onSelect(id)}>
          <Icon aria-hidden="true" size={17} strokeWidth={1.65} />
          {label}
        </button>
      ))}
    </nav>
  )
}
