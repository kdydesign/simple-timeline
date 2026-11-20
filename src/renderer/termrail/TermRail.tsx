import {useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent} from 'react'
import {createPortal} from 'react-dom'
import {Plus, Save} from 'lucide-react'
import {libraryKey, readLibrary, type Library, type Profile, type Tab} from './layout'
import {profileDragType, TerminalTree} from './TerminalTree'
import {Menu, WorkspaceDialog, type CommandMenu, type Editor} from './WorkspaceControls'
import {WorkTabDialog, type WorkTabAction} from './WorkTabDialog'
import {useWorkspace} from './useWorkspace'
import './termrail.css'

function load() {
  try {return {library: readLibrary(localStorage.getItem(libraryKey)), error: ''}}
  catch {return {library: {profiles: [], layouts: []} as Library, error: '저장된 서버와 레이아웃을 읽을 수 없습니다.'}}
}

export function TermRail({active}: {active: boolean}) {
  const [initial] = useState(load)
  const [library, setLibrary] = useState(initial.library)
  const [notice, report] = useState(initial.error)
  const [menu, setMenu] = useState<CommandMenu | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [tabAction, setTabAction] = useState<WorkTabAction | null>(null)
  const focusTabList = useRef(false)
  const addTab = useRef<HTMLButtonElement>(null)
  const desk = useWorkspace(library.profiles, report)
  const {tabs, selected, windows} = desk.workspace
  const current = tabs.find(t => t.id === selected)
  useEffect(() => {
    if (initial.error) return
    const savedIds = initial.library.profiles.flatMap(profile => profile.startup ? [profile.startup.id] : [])
    void window.termRailSsh?.recoverStartup(savedIds).catch(() => report('이전 편집 창의 시작 파일을 정리할 수 없습니다.'))
  }, [initial])
  useEffect(() => {if (!active) {setMenu(null); setEditor(null); setTabAction(null)}}, [active])
  useLayoutEffect(() => {
    if (!focusTabList.current) return
    focusTabList.current = false
    const target = selected ? document.getElementById('tab-' + selected) : addTab.current
    target?.focus()
  }, [tabs, selected])
  function closeTab(id: string) {
    focusTabList.current = true
    desk.closeTab(id)
  }
  function persist(next: Library) {
    if (initial.error) throw Error(initial.error)
    try {localStorage.setItem(libraryKey, JSON.stringify(next))}
    catch {throw Error('서버와 레이아웃을 저장할 수 없습니다.')}
    setLibrary(next)
    const retained = new Set(next.profiles.map(profile => profile.startup?.id))
    for (const profile of library.profiles) {
      if (profile.startup && !retained.has(profile.startup.id))
        void window.termRailSsh?.discardStartup(profile.startup.id).catch(() => report('기존 시작 파일을 삭제할 수 없습니다.'))
    }
  }
  function saveProfile(profile: Profile, connect: boolean) {
    const existing = library.profiles.some(p => p.id === profile.id)
    persist({...library, profiles: existing ? library.profiles.map(p => p.id === profile.id ? profile : p) : [...library.profiles, profile]})
    if (connect) desk.connect(profile)
  }
  function saveLayout(name: string) {
    const saved = {name, layout: desk.snapshot()}
    const exists = library.layouts.some(l => l.name === name)
    persist({...library, layouts: exists ? library.layouts.map(l => l.name === name ? saved : l) : [...library.layouts, saved]})
  }
  function popup(event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>, items: CommandMenu['items']) {
    event.preventDefault()
    const anchor = event.currentTarget
    const rect = anchor.getBoundingClientRect()
    const pointer = event.type === 'contextmenu' && 'clientX' in event && (event.clientX || event.clientY)
    setMenu({anchor, x: pointer ? event.clientX : rect.left, y: pointer ? event.clientY : rect.bottom, items})
  }
  function context(items: (anchor: HTMLElement) => CommandMenu['items']) {
    return {
      onContextMenu: (event: MouseEvent<HTMLElement>) => popup(event, items(event.currentTarget)),
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))
          popup(event, items(event.currentTarget))
      },
    }
  }
  function stage(tab: Tab | undefined, visible: boolean) {
    return <TerminalTree node={tab?.tree ?? null} stage={{profiles: library.profiles, active: visible, focused: tab?.focused ?? null,
      errors: desk.errors, onEnded: desk.sessionEnded,
      onFocus: session => tab && desk.focus(tab.id, session),
      onClose: (path, session) => tab && desk.closePane(tab.id, path, session),
      onResize: (path, ratio) => tab && desk.resize(tab.id, path, ratio),
      onDrop: (path, profileId, side) => desk.drop(tab?.id ?? null, path, profileId, side)}}/>
  }
  return <>
    <section aria-label="TermRail" inert={!active} className="termrail">
      <aside className="termrail-sidebar">
        <div className="termrail-side-head">서버<button type="button" aria-label="서버 추가" onClick={e => setEditor({kind: 'add', anchor: e.currentTarget})}><Plus size={13} aria-hidden="true"/><span>추가</span></button></div>
        <div className="termrail-servers">{library.profiles.map(profile => {
          const commands = context(anchor => [
            ['서버 수정…', () => setEditor({kind: 'edit', profile, anchor})],
            ['서버 삭제…', () => setEditor({kind: 'delete', profile, anchor})],
          ])
          return <button key={profile.id} type="button" title={profile.name} draggable {...commands}
            onDoubleClick={() => desk.connect(profile)} onKeyDown={e => {
              if (e.key === 'Enter') {e.preventDefault(); desk.connect(profile)}
              else commands.onKeyDown(e)
            }} onDragStart={e => {
              e.dataTransfer.setData(profileDragType, profile.id)
              e.dataTransfer.effectAllowed = 'copy'
            }}>{profile.name}</button>
        })}</div>
        <div className="termrail-side-head termrail-layout-title">레이아웃<button aria-label="레이아웃 저장" type="button"
          onClick={e => setEditor({kind: 'layout', name: current ? desk.title(current) : '', anchor: e.currentTarget})}><Save size={13} aria-hidden="true"/><span>저장</span></button></div>
        <div className="termrail-layouts">{library.layouts.map(saved =>
          <button key={saved.name} type="button" title={saved.name} onClick={() => {report(''); desk.replace(saved.layout)}}>{saved.name}</button>)}</div>
      </aside>
      <div className="termrail-work">
        <div className="termrail-tabs">
          <div role="tablist" aria-label="작업 탭">{tabs.map((tab, index) => {
            const commands = context(anchor => [
              ['별도 창으로 열기', () => desk.detach(tab.id)],
              ['작업 이름 변경…', () => setTabAction({kind:'rename', id:tab.id, name:tab.workName, anchor})],
              ['전체 작업 배치 저장…', () => setEditor({kind: 'layout', name: desk.title(tab), anchor})],
              ['작업 탭 닫기', () => {
                const count = desk.liveCount(tab)
                if (count > 1) setTabAction({kind:'close', id:tab.id, name:tab.workName, count, anchor})
                else closeTab(tab.id)
              }],
            ])
            return <button type="button" key={tab.id} role="tab" aria-selected={tab.id === selected} aria-controls={'stage-' + tab.id}
              id={'tab-' + tab.id} tabIndex={tab.id === selected ? 0 : -1}
              onClick={() => desk.selected(tab.id)} {...commands} onKeyDown={e => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                  e.preventDefault()
                  const next = tabs[(index + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]
                  if (next.id !== selected) {
                    focusTabList.current = true
                    desk.selected(next.id)
                  }
                } else commands.onKeyDown(e)
              }}>{desk.title(tab)}</button>
          })}</div>
          <button type="button" ref={addTab} className="termrail-add-tab" aria-label="서버 선택" aria-haspopup="menu" onClick={e => {
            const anchor = e.currentTarget
            popup(e, [['새 터미널…', () => setEditor({kind: 'connect', anchor})],
              ...library.profiles.map((p): [string, () => void] => [p.name, () => desk.connect(p)])])
          }}>＋</button>
        </div>
        {!current && <div className="termrail-stage">{stage(undefined, active)}</div>}
        {tabs.map(tab => <div role="tabpanel" id={'stage-' + tab.id} aria-labelledby={'tab-' + tab.id} key={tab.id}
          className="termrail-stage" hidden={tab !== current}>{stage(tab, active && tab === current)}</div>)}
      </div>
      {notice && <div role="alert" className="termrail-notice">{notice}<button type="button" aria-label="안내 닫기" onClick={() => report('')}>×</button></div>}
      {menu && active && <Menu menu={menu} dismiss={() => setMenu(null)}/>}
      {tabAction && active && <WorkTabDialog action={tabAction} dismiss={() => setTabAction(null)} apply={name => {
        setTabAction(null)
        if (tabAction.kind === 'close') closeTab(tabAction.id)
        else {desk.rename(tabAction.id, name); tabAction.anchor.focus()}
      }}/>}
      {editor && active && <WorkspaceDialog report={report} editor={editor} profiles={library.profiles} close={() => setEditor(null)}
        saveProfile={saveProfile} saveLayout={saveLayout}
        removeProfile={profile => persist({...library, profiles: library.profiles.filter(p => p.id !== profile.id)})}/>}
    </section>
    {windows.map(entry => createPortal(stage(entry.tab, true), entry.mount, entry.tab.id))}
  </>
}
