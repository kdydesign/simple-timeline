import { useEffect, useState } from 'react'
import type { DeviceObservation } from '../../shared/device-rail'

const staleAfterMs = 90_000
const stateLabels = { unknown: '미확인', ok: '가능', failed: '불가', unconfigured: '미설정' } as const
const clock = new Intl.DateTimeFormat('ko-KR', { hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' })
const dateClock = new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' })

export function DeviceTime({ at }: { at: number | null }) {
  if (at === null) return <>없음</>
  const date = new Date(at)
  const text = date.toDateString() === new Date().toDateString() ? clock.format(date) : dateClock.format(date)
  return <time dateTime={date.toISOString()} title={date.toLocaleString('ko-KR')}>{text}</time>
}

export function useObservationClock() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const update = () => setNow(Date.now())
    const timer = window.setInterval(update, 15_000)
    document.addEventListener('visibilitychange', update)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', update) }
  }, [])
  return now
}

export function DeviceStatus({ observation, configured = true, prefix = '', now }: {
  observation?: DeviceObservation
  configured?: boolean
  prefix?: string
  now: number
}) {
  const state = configured ? observation?.state ?? 'unknown' : 'unconfigured'
  const stale = state !== 'unconfigured' && observation?.checkedAt != null && now - observation.checkedAt >= staleAfterMs
  const label = (prefix && prefix + ' ') + stateLabels[state]
  return <span className="device-status-group">
    <span className="device-status" data-tone={state === 'failed' ? 'bad' : state}>{label}</span>
    {stale && <span className="device-stale">오래됨</span>}
  </span>
}
