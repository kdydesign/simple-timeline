import {termRailSessionLimit, type TermRailStartupRef} from '../../shared/termrail-ssh'
import type {TermWindowBounds} from '../../shared/term-window'

export type Profile = {id: string; name: string; host: string; port: number; startup?: TermRailStartupRef}
export type Bounds = TermWindowBounds
export type Tree<T> = {kind: 'pane'; pane: T} | {
  kind: 'split'; direction: 'row' | 'column'; ratio: number; first: Tree<T>; second: Tree<T>
}
export type SavedTab = {titleProfileId: string; title: string; workName?: string; tree: Tree<string>}
export type SavedLayout = {tabs: SavedTab[]; selected: number; windows: {tab: SavedTab; bounds: Bounds}[]}
export type Library = {profiles: Profile[]; layouts: {name: string; layout: unknown}[]}
export type Session = {id: string; profile: Profile; restored?: boolean; temporary?: boolean}
export type Tab = {id: string; workName: string; tree: Tree<Session>; focused: string}
export const libraryKey = 'workrail.termrail.v1'

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}
function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}
// Keep legacy host strings editable. Validate the endpoint when saving or opening a session.
function profile(value: unknown): value is Profile {
  return record(value) && nonempty(value.id) && nonempty(value.name) && typeof value.host === 'string'
    && integer(value.port) && value.port > 0 && value.port <= 65535
    && (value.startup === undefined || (record(value.startup) && nonempty(value.startup.id) && nonempty(value.startup.name)))
}
export function readLibrary(raw: string | null): Library {
  if (raw === null) return {profiles: [], layouts: []}
  const value: unknown = JSON.parse(raw)
  if (!record(value) || !Array.isArray(value.profiles) || !value.profiles.every(profile)
    || new Set(value.profiles.map(p => p.id)).size !== value.profiles.length
    || !Array.isArray(value.layouts) || !value.layouts.every(s => record(s) && nonempty(s.name) && 'layout' in s))
    throw Error('서버와 레이아웃 저장소를 읽을 수 없습니다.')
  return {profiles: value.profiles, layouts: value.layouts}
}
function validBounds(value: unknown): value is Bounds {
  return record(value) && integer(value.x) && integer(value.y)
    && integer(value.width) && value.width > 0 && integer(value.height) && value.height > 0
}
export function checkLayout(value: unknown, profiles: Profile[]): asserts value is SavedLayout {
  const ids = new Set(profiles.map(p => p.id))
  let count = 0
  function tree(node: unknown): boolean {
    if (!record(node)) return false
    if (node.kind === 'pane') {
      if (++count > termRailSessionLimit) throw Error(`터미널은 최대 ${termRailSessionLimit}개까지 열 수 있습니다.`)
      if (typeof node.pane !== 'string' || !ids.has(node.pane))
        throw Error('저장된 레이아웃에서 참조하는 서버를 찾을 수 없습니다.')
      return true
    }
    return node.kind === 'split' && (node.direction === 'row' || node.direction === 'column')
      && typeof node.ratio === 'number' && node.ratio >= .05 && node.ratio <= .95
      && tree(node.first) && tree(node.second)
  }
  const tab = (item: unknown) => record(item) && nonempty(item.titleProfileId) && nonempty(item.title)
    && (item.workName === undefined || nonempty(item.workName)) && tree(item.tree)
  if (!record(value) || !Array.isArray(value.tabs) || !value.tabs.every(tab)
    || !integer(value.selected) || (value.tabs.length ? value.selected < 0 || value.selected >= value.tabs.length : value.selected !== -1)
    || !Array.isArray(value.windows) || !value.windows.every(w => record(w) && validBounds(w.bounds) && tab(w.tab)))
    throw Error('저장된 탭 또는 창 배치를 읽을 수 없습니다.')
}

export function mapTree<T, U>(node: Tree<T>, convert: (pane: T) => U): Tree<U> {
  return node.kind === 'pane' ? {kind: 'pane', pane: convert(node.pane)}
    : {...node, first: mapTree(node.first, convert), second: mapTree(node.second, convert)}
}

export function firstPane<T>(tree: Tree<T>): T {
  return tree.kind === 'pane' ? tree.pane : firstPane(tree.first)
}

export function paneList<T>(tree: Tree<T>): T[] {
  return tree.kind === 'pane' ? [tree.pane] : [...paneList(tree.first), ...paneList(tree.second)]
}

export function newTab(tree: Tree<Session>, workName: string): Tab {
  return {id: crypto.randomUUID(), workName, tree, focused: firstPane(tree).id}
}

export function restoreTab(saved: SavedTab, profiles: Profile[], workName: string): Tab {
  const tree = mapTree(saved.tree, id => {
    const profile = profiles.find(p => p.id === id)!
    return {id: crypto.randomUUID(), profile, restored: true}
  })
  return newTab(tree, workName)
}

export function saveTab(tab: Tab, profiles: Profile[]): SavedTab {
  const {profile} = firstPane(tab.tree)
  return {titleProfileId: profile.id, title: profiles.find(p => p.id === profile.id)?.name ?? profile.name, workName: tab.workName,
    tree: mapTree(tab.tree, session => session.profile.id)}
}

export type Branch = ('first' | 'second')[]
export function editBranch<T>(tree: Tree<T>, path: Branch, edit: (n: Tree<T>) => Tree<T> | null): Tree<T> | null {
  const [side, ...rest] = path
  if (!side) return edit(tree)
  if (tree.kind === 'pane') return tree
  const result = editBranch(tree[side], rest, edit)
  if (result === tree[side]) return tree
  return result ? {...tree, [side]: result} : tree[side === 'first' ? 'second' : 'first']
}

export type Side = 'left' | 'right' | 'top' | 'bottom'
export function splitPane<T>(original: Tree<T>, fresh: T, side: Side): Tree<T> {
  const leaf: Tree<T> = {kind: 'pane', pane: fresh}
  const before = side === 'left' || side === 'top'
  return {kind: 'split', direction: side === 'top' || side === 'bottom' ? 'column' : 'row',
    ratio: .5, first: before ? leaf : original, second: before ? original : leaf}
}
