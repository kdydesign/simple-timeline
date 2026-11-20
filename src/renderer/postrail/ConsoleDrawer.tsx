import {useEffect, useLayoutEffect, useRef, useState} from 'react'
import type {PrConsoleLine} from '../../shared/postrail-console'
import type {PostRailController} from './usePostRail'
import './console.css'

export function ConsoleDrawer({postrail, active}: {postrail:PostRailController, active:boolean}) {
  const {consoleSince, run} = postrail
  const [lines, setLines] = useState<PrConsoleLine[]>([])
  const [error, setError] = useState(false)
  const log = useRef<HTMLPreElement>(null)
  const cursor = useRef(0)
  const follow = useRef(true)

  useEffect(()=>{
    if (!active) return
    let current = true
    consoleSince(cursor.current).then(next=>{
      if (!current) return
      setError(false)
      if (!next.length) return
      cursor.current = next[next.length-1].id
      setLines(previous => [...previous, ...next].slice(-1000))
    }).catch(()=>{ if (current) setError(true) })
    return ()=>{current=false}
  },[active,consoleSince,run?.consoleVersion])

  useLayoutEffect(()=>{
    if (active && follow.current && log.current) log.current.scrollTop = log.current.scrollHeight
  },[active,lines])

  return <section className="pr-drawer" id="postrail-console" aria-label="console">
    <div className="pr-drawer-tools"><h2>console</h2><span>{lines.length.toLocaleString('ko-KR')} / 1,000줄</span>
      {error && <span className="pr-error" role="alert">console을 읽을 수 없습니다.</span>}
    </div>
    <pre className="pr-console-log" ref={log} tabIndex={0} role="region" aria-label="console 로그"
      onScroll={event=>{
        const view = event.currentTarget
        follow.current = view.scrollHeight - view.scrollTop - view.clientHeight < 4
      }}>{lines.length ? lines.map(line=><span key={line.id} data-error={line.error}>{line.text}{line.ending ?? '\n'}</span>) : '기록된 로그가 없습니다.'}</pre>
  </section>
}
