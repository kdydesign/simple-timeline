import type {DragPreview} from '../state/useScheduleDrag'
import type {calendarPreviewSegments} from '../../visualization/calendar'
type Segment=ReturnType<typeof calendarPreviewSegments>[number]
export function CalendarDragPreview({preview,segment,label,color}:{preview:DragPreview;segment?:Segment;label:string;color:string}) {
  if(!segment)return null
  return <div className="calendar-preview-layer" aria-hidden="true">
    <div className={`calendar-bar calendar-preview-bar${preview.valid?'':' invalid'}`}
      data-calendar-preview={preview.id} data-start={preview.startDate} data-end={preview.endDate}
      style={{gridColumn:`${segment.column+1} / span ${segment.span}`,backgroundColor:`color-mix(in srgb, ${color} 32%, var(--surface))`,borderColor:color}}>
      {segment.continuesLeft && '‹ '}{label}{segment.continuesRight && ' ›'}
    </div>
  </div>
}
export function CalendarDragLabel({preview}:{preview:DragPreview}) {
  return <div className="calendar-drag-label" aria-hidden="true" style={{
    left:Math.max(8,Math.min(preview.x+16,window.innerWidth-280)),
    top:Math.max(8,Math.min(preview.y+18,window.innerHeight-76)),
  }}>{preview.startDate} — {preview.endDate}<br/>{preview.valid?'놓아서 저장 · Esc 취소':'영역 밖 · 놓으면 취소'}</div>
}
