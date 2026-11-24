import {useEffect, useRef, useState} from 'react'
import {termRailSessionLimit} from '../../shared/termrail-ssh'
import {hostError, portError} from '../../shared/termrail-endpoint'
import {openTermWindow} from './detach'
import {
  checkLayout, editBranch, firstPane, mapTree, newTab, paneList, restoreTab, saveTab, splitPane,
  type Bounds, type Branch, type Profile, type SavedLayout, type SavedTab, type Session, type Side, type Tab,
} from './layout'

type Floating = {tab: Tab; win: Window; mount: HTMLElement}
type Workspace = {tabs: Tab[]; selected: string | null; windows: Floating[]}

function workspaceTabs(state: Workspace) {
  return [...state.tabs, ...state.windows.map(entry => entry.tab)]
}

function nextName(used: Set<string>) {
  let n = 1
  while (used.has('작업 ' + n)) n++
  const name = '작업 ' + n
  used.add(name)
  return name
}

function endpointError(profile: Profile) {
  const error = hostError(profile.host) || portError(String(profile.port))
  return error && profile.name + ' · ' + error
}

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
  const ended = useRef(new Set<string>())
  function update(next: Workspace) {
    current.current = next
    render(next)
  }
  function start(session: Session) {
    live.current.add(session.id)
    const failed = () => {
      if (!live.current.has(session.id)) return
      ended.current.add(session.id)
      setErrors(previous => new Set(previous).add(session.id))
    }
    const api = window.termRailSsh
    if (!api) { failed(); return }
    const {host, port, startup} = session.profile
    void api.open(session.id, {host, port, ...(!session.restored && startup && {startupId: startup.id})}).catch(failed)
  }
  function stop(id: string) {
    if (!live.current.delete(id)) return
    ended.current.delete(id)
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
  function connect(profile: Profile, temporary = false) {
    const error = endpointError(profile)
    if (error) {report(error); return}
    if (!hasCapacity()) return
    const pane = {id: crypto.randomUUID(), profile, temporary}
    const usedNames = new Set(workspaceTabs(current.current).map(tab => tab.workName))
    const tab = newTab({kind: 'pane', pane}, nextName(usedNames))
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
    const error = endpointError(profile)
    if (error) {report(error); return}
    const tab = find(id)
    if (!tab || !hasCapacity()) return
    const pane = {id: crypto.randomUUID(), profile}
    const tree = editBranch(tab.tree, path, n => splitPane(n, pane, side))!
    start(pane)
    change({...tab, tree, focused: pane.id})
  }
  function sessionEnded(id: string) {
    if (live.current.has(id)) ended.current.add(id)
  }
  function liveCount(tab: Tab) {
    return paneList(tab.tree).filter(pane => live.current.has(pane.id) && !ended.current.has(pane.id)).length
  }
  function rename(id: string, workName: string) {
    const tab = find(id)
    if (tab && workName.trim()) change({...tab, workName: workName.trim()})
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
    removeTab(id)
  }
  function closeTab(id: string) {
    const tab = find(id)
    if (!tab) return
    for (const pane of paneList(tab.tree)) stop(pane.id)
    removeTab(id)
  }
  function removeTab(id: string) {
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
  function temporaryProfiles(): Profile[] {
    const pending = new Map<string, Profile>()
    for (const tab of workspaceTabs(current.current)) {
      for (const pane of paneList(tab.tree)) {
        if (pane.temporary) pending.set(pane.profile.id, pane.profile)
      }
    }
    return [...pending.values()]
  }
  function bindProfiles(registered: ReadonlyMap<string, Profile>) {
    if (!registered.size) return
    function bind(tab: Tab): Tab {
      return {...tab, tree: mapTree(tab.tree, pane => {
        const profile = registered.get(pane.profile.id)
        return profile && pane.temporary ? {...pane, profile, temporary:false} : pane
      })}
    }
    const state = current.current
    update({...state, tabs: state.tabs.map(bind), windows: state.windows.map(w => ({...w, tab:bind(w.tab)}))})
  }
  function snapshot(available: Profile[]): SavedLayout {
    const state = current.current
    const layout = {tabs: state.tabs.map(tab => saveTab(tab, available)), selected: state.tabs.findIndex(t => t.id === state.selected),
      windows: state.windows.map(w => ({tab: saveTab(w.tab, available), bounds: windowBounds(w.win)}))}
    checkLayout(layout, available)
    return layout
  }
  function replace(layout: unknown) {
    const windows: Floating[] = []
    let next: Workspace
    try {
      checkLayout(layout, profiles)
      const savedTabs = [...layout.tabs, ...layout.windows.map(entry => entry.tab)]
      const used = new Set(savedTabs.flatMap(tab => tab.workName ? [tab.workName] : []))
      for (const saved of savedTabs) {
        for (const id of paneList(saved.tree)) {
          const error = endpointError(profiles.find(p => p.id === id)!)
          if (error) throw Error(error)
        }
      }
      const restore = (saved: SavedTab) => restoreTab(saved, profiles, saved.workName ?? nextName(used))
      const tabs = layout.tabs.map(restore)
      for (const item of layout.windows) windows.push(prepareWindow(restore(item.tab), item.bounds))
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
    for (const tab of workspaceTabs(next)) {
      for (const pane of paneList(tab.tree)) start(pane)
    }
    windows.forEach(watch)
  }

  function title(tab: Tab) {
    if (tab.tree.kind === 'split') return tab.workName + ' · ' + paneList(tab.tree).length
    const {profile} = tab.tree.pane
    return profiles.find(p => p.id === profile.id)?.name ?? profile.name
  }
  useEffect(() => {
    for (const entry of workspace.windows) entry.mount.ownerDocument.title = 'TermRail · ' + title(entry.tab)
  }, [profiles, workspace.windows])
  return {workspace, errors, selected, title, focus, connect, detach, resize, drop, closePane, closeTab, liveCount, sessionEnded, rename,
    temporaryProfiles, bindProfiles, snapshot, replace}
}
