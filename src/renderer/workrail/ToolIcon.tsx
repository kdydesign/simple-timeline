import type { WorkRailTool } from './ToolDock'

/** Menu E: modular shapes remain legible without a font or raster asset. */
export function ToolIcon({ tool, size = 20 }: { tool: WorkRailTool; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    {tool === 'home' ? <>
      <rect x="2" y="2" width="11" height="11" rx="2.5" />
      <rect x="15" y="2" width="7" height="8" rx="2" className="workrail-icon-accent" />
      <rect x="2" y="15" width="8" height="7" rx="2" />
      <path opacity=".7" d="M16 12h3a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3h-5a2 2 0 0 1-2-2v-4z" />
    </> : tool === 'planrail' ? <>
      <path d="M3 3h1.5v18H3zM4 11h6v1.5H4z" />
      <circle cx="3.75" cy="4.5" r="2" /><circle cx="3.75" cy="11.75" r="2" /><circle cx="3.75" cy="19.5" r="2" />
      <rect x="7" y="2" width="13" height="5" rx="2.5" className="workrail-icon-accent" />
      <rect x="9" y="9.25" width="13" height="5" rx="2.5" />
      <rect x="7" y="17" width="16" height="5" rx="2.5" opacity=".7" />
    </> : <>
      <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h3.3L17 13V9.5A1.5 1.5 0 0 1 18.5 8H21v12.5a1.5 1.5 0 0 1-1.5 1.5h-3.3L6 11v3.5A1.5 1.5 0 0 1 4.5 16H2z" />
      <rect x="16" y="2" width="6" height="5" rx="1.3" className="workrail-icon-accent" />
      <rect x="2" y="18" width="6" height="4" rx="1.3" className="workrail-icon-accent" />
    </>}
  </svg>
}
