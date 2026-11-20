import {useState, type DragEvent} from 'react'
import {TerminalPane} from './TerminalPane'
import type {Branch, Profile, Session, Side, Tree} from './layout'

export const profileDragType = 'application/x-termrail-server'

type StageProps = {
  profiles: Profile[]
  focused: string | null
  active: boolean
  errors: ReadonlySet<string>
  onFocus: (id: string) => void
  onEnded: (id: string) => void
  onClose: (path: Branch, id: string) => void
  onDrop: (path: Branch, profileId: string, side: Side) => void
  onResize: (path: Branch, ratio: number) => void
}

function dropSide(event: DragEvent<HTMLElement>): Side {
  const r = event.currentTarget.getBoundingClientRect()
  const x = (event.clientX - r.left) / r.width
  const y = (event.clientY - r.top) / r.height
  const edges: [Side, number][] = [['left', x], ['right', 1 - x], ['top', y], ['bottom', 1 - y]]
  return edges.reduce((best, edge) => edge[1] < best[1] ? edge : best)[0]
}

function Pane({node, path, stage}: {node: Session | null; path: Branch; stage: StageProps}) {
  const [hint, setHint] = useState<Side | 'all' | null>(null)
  const savedProfile = node && stage.profiles.find(profile => profile.id === node.profile.id)
  const title = savedProfile?.name ?? node?.profile.name
  const startupId = node?.restored && savedProfile?.host === node.profile.host && savedProfile.port === node.profile.port
    ? savedProfile.startup?.id : undefined
  const close = () => {if (node) stage.onClose(path, node.id)}
  return <div className="termrail-leaf" data-focused={stage.active && node?.id === stage.focused}
    onFocusCapture={() => node && stage.onFocus(node.id)}
    onPointerDownCapture={() => node && stage.onFocus(node.id)}
    onDragOver={event => {
      if (!event.dataTransfer.types.includes(profileDragType)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
      setHint(node ? dropSide(event) : 'all')
    }}
    onDragLeave={event => {
      if (!event.relatedTarget || !event.currentTarget.contains(event.relatedTarget as Node)) setHint(null)
    }}
    onDrop={event => {
      setHint(null)
      const id = event.dataTransfer.getData(profileDragType)
      if (!stage.profiles.some(p => p.id === id)) return
      event.preventDefault()
      stage.onDrop(path, id, dropSide(event))
    }}>
    {node ? <>
      <div className="termrail-caption" title={node.profile.host + ':' + node.profile.port}>
        <span>{title}</span>
        <button type="button" title={title + ' 터미널 닫기'} aria-label={title + ' 터미널 닫기'} onClick={close}>×</button>
      </div>
      {stage.errors.has(node.id)
        ? <p className="termrail-session-error" role="alert">SSH 연결을 시작할 수 없습니다.</p>
        : <TerminalPane key={node.id} sessionId={node.id} startupId={startupId} active={stage.active && node.id === stage.focused} onClose={close} onEnded={() => stage.onEnded(node.id)}/>}
    </> : <span className="termrail-empty">서버를 여기에 놓으세요</span>}
    {hint && <div aria-hidden="true" className={'termrail-drop ' + hint}/>}
  </div>
}

export function TerminalTree({node, path = [], stage}: {node: Tree<Session> | null; path?: Branch; stage: StageProps}) {
  if (!node || node.kind === 'pane') return <Pane node={node?.pane ?? null} path={path} stage={stage}/>
  const row = node.direction === 'row'
  const resize = (ratio: number) => stage.onResize(path, Math.max(.05, Math.min(.95, ratio)))
  const child = (side: 'first' | 'second', fraction: number) =>
    <div className="termrail-branch" style={{flexGrow: fraction}}><TerminalTree node={node[side]} path={[...path, side]} stage={stage}/></div>
  return <div className={'termrail-split ' + node.direction}>
    {child('first', node.ratio)}
    <div role="separator" tabIndex={0} className="termrail-divider pane-divider" aria-label="터미널 크기 조절"
      aria-orientation={row ? 'vertical' : 'horizontal'} aria-valuemin={5} aria-valuemax={95}
      aria-valuenow={Math.round(node.ratio * 100)}
      onPointerDown={e => {
        if (e.button !== 0) return
        e.currentTarget.focus()
        e.currentTarget.setPointerCapture(e.pointerId)
        e.preventDefault()
      }}
      onPointerMove={e => {
        const divider = e.currentTarget
        if (!divider.hasPointerCapture(e.pointerId)) return
        const parent = divider.parentElement!.getBoundingClientRect()
        const thickness = row ? divider.offsetWidth : divider.offsetHeight
        const available = (row ? parent.width : parent.height) - thickness
        if (available > 0) resize(((row ? e.clientX - parent.left : e.clientY - parent.top) - thickness / 2) / available)
      }}
      onKeyDown={e => {
        const [decrease, increase] = row ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown']
        if (e.key !== decrease && e.key !== increase) return
        e.preventDefault()
        resize(node.ratio + (e.key === decrease ? -.02 : .02))
      }}/>
    {child('second', 1 - node.ratio)}
  </div>
}
