import {
  useEffect, useLayoutEffect, useRef, useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { Schedule } from '../../shared/types'
import { dragDates, type Dates, type DragKind } from '../../visualization/drag'

export interface DragActions {
  onDragStart?: () => boolean
  onDragCommit?: (schedule: Schedule, dates: Dates) => void
  onDragEnd?: () => void
}
interface Options extends DragActions {
  enabled: boolean
  dateAt: (x: number, y: number) => number | null
  navigate?: (x: number, y: number, time: number) => void
  reset?: () => void
}
export type DragPreview = Dates & {id:string;x:number;y:number;valid:boolean}
interface Session {
  schedule: Schedule
  kind: DragKind
  anchor: number
  x: number
  y: number
  originX: number
  originY: number
  pointer: number
  moved: boolean
  valid: boolean
  dates: Dates
}
export function useScheduleDrag(options: Options) {
  const latest = useRef(options)
  const session = useRef<Session | null>(null)
  const suppress = useRef(false)
  const suppressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const cancelSession = useRef<()=>void>(()=>{})
  const startTick = useRef<() => void>(() => {})
  const [preview, setPreview] = useState<DragPreview | null>(null)
  useLayoutEffect(() => { latest.current = options; if(!options.enabled)cancelSession.current() })

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined
    const swallowClick = () => {
      suppress.current = true
      clearTimeout(suppressTimer.current)
    }
    const releaseSuppression = () => {
      // Escape may finish before pointerup. Keep suppression until that release's click.
      suppressTimer.current = setTimeout(() => { suppress.current = false }, 0)
    }
    const finish = (commit: boolean) => {
      const s = session.current
      if (!s) return
      session.current = null
      setPreview(null)
      clearInterval(timer)
      timer = undefined
      if (s.moved) {
        swallowClick()
        const changed = s.dates.startDate !== s.schedule.startDate || s.dates.endDate !== s.schedule.endDate
        if (commit && s.valid && latest.current.enabled && changed)
          latest.current.onDragCommit?.(s.schedule, s.dates)
        latest.current.onDragEnd?.()
      }
      latest.current.reset?.()
    }
    cancelSession.current=()=>finish(false)
    const update = () => {
      const s = session.current
      if (!s?.moved) return
      if (!latest.current.enabled) { finish(false); return }
      const ordinal = latest.current.dateAt(s.x, s.y)
      s.valid = ordinal !== null
      if (ordinal !== null) {
        s.dates = dragDates(s.schedule, s.kind, ordinal - s.anchor)
      }
      setPreview(v => v?.startDate === s.dates.startDate && v?.endDate === s.dates.endDate
        && v.x === s.x && v.y === s.y && v.valid === s.valid
        ? v : { ...s.dates, id:s.schedule.id, x:s.x, y:s.y, valid:s.valid })
    }

    const move = (e: PointerEvent) => {
      const s = session.current
      if (!s || s.pointer !== e.pointerId) return
      s.x = e.clientX
      s.y = e.clientY
      if (!s.moved && Math.hypot(s.x - s.originX, s.y - s.originY) >= 4) {
        if (latest.current.onDragStart?.() === false) {
          swallowClick()
          finish(false)
          return
        }
        s.moved = true
      }
      if (s.moved) { e.preventDefault(); update() }
    }
    const up = (e: PointerEvent) => {
      if (session.current?.pointer === e.pointerId) { move(e); finish(true) }
      releaseSuppression()
    }
    const down = () => {
      if (!session.current) {
        clearTimeout(suppressTimer.current)
        suppress.current = false
      }
    }
    const cancel = () => finish(false)
    const key = (e: KeyboardEvent) => {
      if (session.current && e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation()
        finish(false)
      }
    }
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('blur', cancel)
    window.addEventListener('keydown', key, true)
    startTick.current = () => {
      if (timer !== undefined) return
      timer = setInterval(() => {
        const s = session.current
        if (s?.moved) {
          latest.current.navigate?.(s.x, s.y, performance.now())
          update()
        }
      }, 60)
    }
    return () => {
      clearInterval(timer)
      clearTimeout(suppressTimer.current)
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('blur', cancel)
      window.removeEventListener('keydown', key, true)
    }
  }, [])

  return {
    preview,
    isActive: () => session.current !== null,
    begin: (e: ReactPointerEvent, schedule: Schedule, kind: DragKind = 'move') => {
      if (schedule.sharing === 'member' || !options.enabled || e.button !== 0 || !e.isPrimary) return
      const anchor = options.dateAt(e.clientX, e.clientY)
      if (anchor === null) return
      e.stopPropagation()
      e.preventDefault()
      session.current = {
        schedule, kind, anchor, x: e.clientX, y: e.clientY,
        originX: e.clientX, originY: e.clientY, pointer: e.pointerId,
        moved: false, valid: true, dates: schedule,
      }
      startTick.current()
    },
    consumeClick: () => suppress.current,
  }
}
