import type { WorkRailTool } from './ToolDock'

const paths: Record<WorkRailTool, string> = {
  home: 'M3 10.5 12 3l9 7.5v10H15v-6h-6v6H3z',
  planrail: 'M3.5 3.5v17M7 6h8M10 12h8M13 18h8',
  node: 'm12 2 8.7 5v10L12 22l-8.7-5V7z M9 15.5v-7l6 7v-7',
}

export function ToolIcon({ tool, size = 20 }: { tool: WorkRailTool; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={paths[tool]} />
    </svg>
  )
}
