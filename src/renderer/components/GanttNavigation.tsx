import type { CSSProperties, KeyboardEvent } from 'react'

interface Props {
  bodyId: string
  offset: number
  min: number
  max: number
  viewport: number
  dayWidth: number
  rangeText: string
  zoomDisabled: boolean
  onMove: (offset: number) => void
  onZoom: (width: number) => void
  onHorizontalKey: (event: KeyboardEvent) => void
}

// A bounded range drives the virtual timeline. A native overflow spacer would
// exceed Chromium's layout limits for the supported 0001–9999 date range.
export function GanttNavigation(p: Props) {
  const percent = p.dayWidth / 28 * 100
  return <div className="gantt-navigation">
    <div className="gantt-zoom">
      <button type="button" className="zoom-percent" aria-label="간트 배율 100%로 초기화"
        disabled={p.zoomDisabled} onClick={() => p.onZoom(28)}>{Math.round(percent)}%</button>
      <input type="range" className="zoom-slider" aria-label="간트 배율"
        min={50} max={300} step="any" value={percent} aria-valuetext={`${Math.round(percent)}%`}
        disabled={p.zoomDisabled} onChange={e => p.onZoom(Number(e.target.value) / 100 * 28)}
        onKeyDown={e => {
          const delta = {ArrowLeft:-1,ArrowDown:-1,ArrowRight:1,ArrowUp:1,PageDown:-10,PageUp:10}[e.key]
          if (delta !== undefined || e.key === 'Home' || e.key === 'End') {
            e.preventDefault()
            const next = e.key === 'Home' ? 50 : e.key === 'End' ? 300 : percent + delta!
            p.onZoom(Math.max(50, Math.min(300, next)) / 100 * 28)
          }
        }}/>
    </div>
    <div className="gantt-horizontal">
      <input type="range" role="scrollbar" className="horizontal-scrollbar"
        aria-label="간트 가로 이동" aria-orientation="horizontal" aria-controls={p.bodyId}
        aria-describedby="gantt-help" aria-valuemin={p.min} aria-valuemax={p.max} aria-valuenow={p.offset}
        aria-valuetext={p.rangeText} min={p.min} max={p.max} step="any" value={p.offset}
        style={{'--scroll-thumb-width':`${p.viewport / (p.max - p.min + p.viewport) * 100}%`} as CSSProperties}
        onKeyDown={p.onHorizontalKey} onChange={e => p.onMove(Number(e.target.value))}/>
    </div>
  </div>
}
