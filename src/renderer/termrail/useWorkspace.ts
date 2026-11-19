import {useEffect, useRef, useState} from 'react'
import {termRailSessionLimit} from '../../shared/termrail-ssh'
import {openTermWindow} from './detach'
import {
  checkLayout, editBranch, firstPane, newTab, paneList, restoreTab, saveTab, splitPane,
  type Bounds, type Branch, type Profile, type SavedLayout, type Session, type Side, type Tab,
} from './layout'

type Floating = {tab: Tab; win: Window; mount: HTMLElement}
type Workspace = {tabs: Tab[]; selected: string | null; windows: Floating[]}

function windowBounds(win: Window): Bounds {
  return {x: win.screenX, y: win.screenY, width: win.outerWidth, height: win.outerHeight}
}

function prepareWindow(tab: Tab, bounds?: Bounds): Floating {
  const win = openTermWindow(bounds)
  if (!win) throw Error('별도 창을 열 수 없습니다.')
  try {
    const doc = win.document
    doc.documentElement.lang = 'ko'
    doc.documentElement.dataset.theme = document.documentElement.dataset.theme
    for (const el of document.head.querySelectorAll<HTMLStyleElement | HTMLLinkElement>('style,link[rel="stylesheet"]')) {
      const clone = el.cloneNode(true) as HTMLStyleElement | HTMLLinkElement
      if (el instanceof HTMLLinkElement) (clone as HTMLLinkElement).href = el.href
      doc.head.appendChild(clone)
    }
    const mount = doc.createElement('div')
    mount.className = 'termrail-floating'
    doc.body.appendChild(mount)
    return {win, tab, mount}
  } catch (err) {
    win.close()
    throw err
  }
}

export function useWorkspace(profiles: Profile[], report: (error: string) => void) {
  const [workspace, render] = useState<Workspace>({tabs: [], selected: null, windows: []})
  const current = useRef(workspace)
  const [errors, setErrors] = useState<Set<string>>(new Set())
  const live = useRef(new Set<string>())
  function update(next: Workspace) {
    current.current = next
    render(next)
  }
  function start(session: Session) {
    live.current.add(session.id)
    const failed = () => {
      if (live.current.has(session.id)) setErrors(previous => new Set(previous).add(session.id))
    }
    const api = window.termRailSsh
    if (!api) { failed(); return }
    void api.open(session.id, {host: session.profile.host, port: session.profile.port}).catch(failed)
  }
  function stop(id: string) {
    live.current.delete(id)
    void window.termRailSsh?.close(id).catch(() => report('SSH 세션을 종료할 수 없습니다.'))
    setErrors(previous => {
      if (!previous.has(id)) return previous
      const next = new Set(previous)
      next.delete(id)
      return next
    })
  }
  function reattach(win: Window) {
    const state = current.current
    const entry = state.windows.find(w => w.win === win)
    if (!entry) return
    update({tabs: [...state.tabs, entry.tab], selected: entry.tab.id, windows: state.windows.filter(w => w !== entry)})
  }
  function watch(entry: Floating) {
    entry.win.addEventListener('pagehide', () => reattach(entry.win), {once: true})
  }
  useEffect(() => {
    if (!workspace.windows.length) return
    const check = () => {
      for (const entry of current.current.windows) {
        if (entry.win.closed) reattach(entry.win)
        else entry.mount.ownerDocument.documentElement.dataset.theme = document.documentElement.dataset.theme
      }
    }
    const timer = window.setInterval(check, 500)
    const observer = new MutationObserver(check)
    observer.observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']})
    return () => {clearInterval(timer); observer.disconnect()}
  }, [workspace.windows.length])
  useEffect(() => () => {
    const old = current.current
    current.current = {tabs: [], selected: null, windows: []}
    for (const entry of old.windows) entry.win.close()
    for (const id of live.current) void window.termRailSsh?.close(id).catch(() => undefined)
    live.current.clear()
  }, [])

  function find(id: string) {
    const state = current.current
    return state.tabs.find(t => t.id === id) ?? state.windows.find(w => w.tab.id === id)?.tab
  }
  function change(tab: Tab) {
    const state = current.current
    update({...state, tabs: state.tabs.map(t => t.id === tab.id ? tab : t),
      windows: state.windows.map(w => w.tab.id === tab.id ? {...w, tab} : w)})
  }
  function hasCapacity() {
    if (live.current.size < termRailSessionLimit) return true
    report(`터미널은 최대 ${termRailSessionLimit}개까지 열 수 있습니다.`)
    return false
  }
  function connect(profile: Profile) {
    if (!hasCapacity()) return
    const pane = {id: crypto.randomUUID(), profile}
    const tab = newTab({kind: 'pane', pane})
    start(pane)
    const state = current.current
    update({...state, tabs: [...state.tabs, tab], selected: tab.id})
  }
  function selected(id: string) {
    if (current.current.selected !== id) update({...current.current, selected: id})
  }
  function focus(id: string, session: string) {
    const tab = find(id)
    if (tab && tab.focused !== session) change({...tab, focused: session})
  }
  function resize(id: string, path: Branch, ratio: number) {
    const tab = find(id)
    if (tab) change({...tab, tree: editBranch(tab.tree, path, n => n.kind === 'split' ? {...n, ratio} : n)!})
  }
  function drop(id: string | null, path: Branch, profileId: string, side: Side) {
    const profile = profiles.find(p => p.id === profileId)
    if (!profile) return
    if (!id) {connect(profile); return}
    const tab = find(id)
    if (!tab || !hasCapacity()) return
    const pane = {id: crypto.randomUUID(), profile}
    const tree = editBranch(tab.tree, path, n => splitPane(n, pane, side))!
    start(pane)
    change({...tab, tree, focused: pane.id})
  }
  function closePane(id: string, path: Branch, session: string) {
    const tab = find(id)
    if (!tab) return
    const tree = editBranch(tab.tree, path, n => n.kind === 'pane' && n.pane.id === session ? null : n)
    if (tree === tab.tree) return
    stop(session)
    if (tree) {
      change({...tab, tree, focused: tab.focused === session ? firstPane(tree).id : tab.focused})
      return
    }
    const state = current.current
    const index = state.tabs.findIndex(t => t.id === id)
    const tabs = state.tabs.filter(t => t.id !== id)
    const floating = state.windows.find(w => w.tab.id === id)
    update({tabs, selected: state.selected === id ? (tabs[index] ?? tabs[index - 1])?.id ?? null : state.selected,
      windows: state.windows.filter(w => w !== floating)})
    floating?.win.close()
  }
  function detach(id: string) {
    const state = current.current
    const tab = state.tabs.find(t => t.id === id)
    if (!tab) return
    try {
      const floating = prepareWindow(tab)
      const tabs = state.tabs.filter(t => t !== tab)
      update({tabs, selected: state.selected === id ? tabs[0]?.id ?? null : state.selected, windows: [...state.windows, floating]})
      watch(floating)
      floating.win.focus()
    } catch { report('별도 창을 열 수 없습니다.') }
  }
  function snapshot(): SavedLayout {
    const state = current.current
    const saved = (tab: Tab) => ({...saveTab(tab), title: title(tab)})
    const layout = {tabs: state.tabs.map(saved), selected: state.tabs.findIndex(t => t.id === state.selected),
      windows: state.windows.map(w => ({tab: saved(w.tab), bounds: windowBounds(w.win)}))}
    checkLayout(layout, profiles)
    return layout
  }
  function replace(layout: unknown) {
    const windows: Floating[] = []
    let next: Workspace
    try {
      checkLayout(layout, profiles)
      const tabs = layout.tabs.map(saved => restoreTab(saved, profiles))
      for (const item of layout.windows) windows.push(prepareWindow(restoreTab(item.tab, profiles), item.bounds))
      next = {tabs, selected: tabs[layout.selected]?.id ?? null, windows}
    } catch (error) {
      for (const entry of windows) entry.win.close()
      report(error instanceof Error ? error.message : '레이아웃을 열 수 없습니다.')
      return
    }
    const previous = current.current
    // Native close callbacks may run synchronously. Replace their registry first.
    update(next)
    for (const entry of previous.windows) entry.win.close()
    for (const id of [...live.current]) stop(id)
    for (const tab of [...next.tabs, ...windows.map(w => w.tab)]) {
      for (const pane of paneList(tab.tree)) start(pane)
    }
    windows.forEach(watch)
  }

  function title(tab: Tab) {
    return profiles.find(p => p.id === tab.titleProfileId)?.name ?? tab.title
  }
  useEffect(() => {
    for (const entry of workspace.windows) entry.mount.ownerDocument.title = 'TermRail · ' + title(entry.tab)
  }, [profiles, workspace.windows])
  return {workspace, errors, selected, title, focus, connect, detach, resize, drop, closePane, snapshot, replace}
}
