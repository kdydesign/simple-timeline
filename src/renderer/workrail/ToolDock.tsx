import { ToolIcon } from './ToolIcon'
import type { Ref } from 'react'

const tools = [
  { id: 'home', label: 'Home' },
  { id: 'planrail', label: 'PlanRail' },
  { id: 'node', label: 'NodeRail' },
  { id: 'termrail', label: 'TermRail' },
  { id: 'postrail', label: 'PostRail' },
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
      {tools.map(({ id, label }) => (
        <button key={id} type="button" className="workrail-control"
          ref={current === id ? activeButton : undefined}
          aria-current={current === id ? 'page' : undefined}
          aria-keyshortcuts={current === id ? 'F6' : undefined}
          disabled={blocked} onClick={() => onSelect(id)}>
          <ToolIcon tool={id} size={20} />
          {label}
        </button>
      ))}
    </nav>
  )
}
