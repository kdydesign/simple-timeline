import {act, fireEvent, render, screen, within} from '@testing-library/react'
import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import {TermRail} from '../../src/renderer/termrail/TermRail'
import {libraryKey, type Library, type Profile, type SavedLayout} from '../../src/renderer/termrail/layout'
import {openTermWindow} from '../../src/renderer/termrail/detach'

vi.mock('../../src/renderer/termrail/TerminalPane', () => ({
  TerminalPane: ({sessionId, startupId}: {sessionId: string; startupId?: string}) =>
    <span data-testid="session" data-startup-id={startupId}>{sessionId}</span>,
}))
vi.mock('../../src/renderer/termrail/detach', () => ({openTermWindow: vi.fn()}))
// JSDOM does not implement the native dialog methods used in Electron.
HTMLDialogElement.prototype.showModal ??= function () { this.open = true }
HTMLDialogElement.prototype.close ??= function () { this.open = false }
const ssh = {
  open: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined),
  discardStartup: vi.fn().mockResolvedValue(undefined), recoverStartup: vi.fn().mockResolvedValue(undefined),
}
const profiles: Profile[] = [
  {id: 'a', name: '개발', host: 'dev.test', port: 22}, {id: 'b', name: '검증', host: 'qa.test', port: 2222},
]
function seed(layouts: Library['layouts'] = []) {
  localStorage.setItem(libraryKey, JSON.stringify({profiles, layouts}))
}
function popup() {
  const frame = document.createElement('iframe')
  document.body.append(frame)
  const win = frame.contentWindow!
  vi.spyOn(win, 'focus').mockImplementation(() => {})
  vi.spyOn(win, 'close').mockImplementation(() => {
    win.dispatchEvent(new Event('pagehide'))
    Object.defineProperty(win, 'closed', {value: true, configurable: true})
  })
  return win
}
beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('termRailSsh', ssh)
  vi.clearAllMocks()
  seed()
})
afterEach(() => {
  vi.unstubAllGlobals()
  document.querySelectorAll('iframe').forEach(frame => frame.remove())
})
const button = (name: string) => screen.getByRole('button', {name})
const openDev = () => fireEvent.doubleClick(button('개발'))
function drop(server: string, target: HTMLElement, x: number, y: number) {
  const data = new Map<string, string>()
  const dataTransfer = {
    types: ['application/x-termrail-server'], setData: (key: string, value: string) => data.set(key, value),
    getData: (key: string) => data.get(key) ?? '',
  }
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 100))
  fireEvent.dragStart(button(server), {dataTransfer})
  // JSDOM's synthetic DragEvent omits client coordinates. Supply the browser values.
  const event = new Event('drop', {bubbles:true,cancelable:true})
  Object.assign(event, {dataTransfer, clientX:x, clientY:y})
  fireEvent(target,event)
}
function detachDev() {
  fireEvent.contextMenu(screen.getByRole('tab', {name:'개발'}))
  fireEvent.click(screen.getByRole('menuitem', {name:'별도 창으로 열기'}))
}

it('keeps sessions across tool and native-window moves, and closes only the chosen pane', () => {
  const win = popup()
  vi.mocked(openTermWindow).mockReturnValue(win)
  const app = render(<TermRail active/>)
  openDev()
  const original = screen.getByTestId('session').textContent
  detachDev()
  expect(within(win.document.body).getByTestId('session')).toHaveTextContent(original!)
  expect(screen.queryByRole('tab')).toBeNull()
  app.rerender(<TermRail active={false}/>)
  app.rerender(<TermRail active/>)
  act(() => win.close())
  expect(screen.getByRole('tab', {name:'개발'})).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByTestId('session')).toHaveTextContent(original!)
  expect(ssh.open).toHaveBeenCalledTimes(1)
  expect(ssh.close).not.toHaveBeenCalled()
  fireEvent.click(button('개발 터미널 닫기'))
  expect(ssh.close).toHaveBeenCalledExactlyOnceWith(original)
  expect(screen.queryByRole('tab')).toBeNull()
})

it('saves restored split ratios and restores a fresh connection for each occurrence', () => {
  const tab = {titleProfileId: 'a', title: '개발', tree: {kind: 'split' as const, ratio: .6, direction: 'row' as const,
    first: {kind: 'pane' as const, pane: 'a'}, second: {kind: 'pane' as const, pane: 'a'}}}
  seed([{name:'점검', layout:{tabs:[tab], selected:0, windows:[]}}])
  render(<TermRail active/>)
  openDev()
  const original = screen.getByTestId('session').textContent
  fireEvent.click(button('점검'))
  expect(ssh.close).toHaveBeenCalledExactlyOnceWith(original)
  const split = screen.getByRole('separator', {name:'터미널 크기 조절'})
  expect(split).toHaveAttribute('aria-valuenow','60')
  fireEvent.keyDown(split, {key:'ArrowRight'})
  expect(split).toHaveAttribute('aria-valuenow','62')
  fireEvent.click(button('레이아웃 저장'))
  const dialog = screen.getByRole('dialog', {name:'레이아웃 저장'})
  fireEvent.change(within(dialog).getByLabelText('레이아웃 이름'), {target:{value:'조정'}})
  fireEvent.click(within(dialog).getByRole('button', {name:'저장'}))
  const serialized = localStorage.getItem(libraryKey)!
  expect(JSON.parse(serialized).layouts[1].layout.tabs[0].tree.ratio).toBe(.62)
  for (const session of screen.getAllByTestId('session')) expect(serialized).not.toContain(session.textContent!)
  const ids = screen.getAllByTestId('session').map(e => e.textContent)
  fireEvent.click(screen.getAllByRole('button',{name:'개발 터미널 닫기'})[0])
  expect(ssh.close.mock.calls[1][0]).toBe(ids[0])
  expect(screen.getByTestId('session')).toHaveTextContent(ids[1]!)
  expect(screen.queryByRole('separator')).toBeNull()
  fireEvent.click(button('조정'))
  expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow','62')
  expect(ssh.open).toHaveBeenCalledTimes(5)
  expect(new Set(ssh.open.mock.calls.map(([id]) => id)).size).toBe(5)
})

it('prevalidates a missing profile and window creation before replacing a detached session', () => {
  const tab = {titleProfileId:'a', title:'개발', tree:{kind:'pane' as const, pane:'a'}}
  const bounds = {x:10,y:20,width:500,height:400}
  const saved: SavedLayout = {tabs:[],selected:-1,windows:[{tab, bounds},{tab, bounds}]}
  seed([{name:'삭제된 서버',layout:{tabs:[{...tab, tree:{kind:'pane',pane:'removed'}}],selected:0,windows:[]}}, {name:'두 창', layout:saved}])
  const first = popup()
  const staged = popup()
  vi.mocked(openTermWindow).mockReturnValueOnce(first).mockReturnValueOnce(staged).mockReturnValueOnce(null)
  render(<TermRail active/>)
  openDev()
  detachDev()
  const id = within(first.document.body).getByTestId('session').textContent!
  fireEvent.click(button('삭제된 서버'))
  expect(screen.getByRole('alert')).toHaveTextContent('서버를 찾을 수 없습니다')
  expect(openTermWindow).toHaveBeenCalledTimes(1)
  fireEvent.click(button('두 창'))
  expect(screen.getByRole('alert')).toHaveTextContent('별도 창을 열 수 없습니다')
  expect(staged.close).toHaveBeenCalledOnce()
  expect(first.close).not.toHaveBeenCalled()
  expect(ssh.close).not.toHaveBeenCalled()
  expect(within(first.document.body).getByTestId('session')).toHaveTextContent(id)
  act(() => first.close())
})

it('updates a saved profile by ID and applies its edited endpoint on the next connection', () => {
  render(<TermRail active/>)
  openDev()
  fireEvent.contextMenu(button('개발'))
  fireEvent.click(screen.getByRole('menuitem',{name:'서버 수정…'}))
  const dialog = screen.getByRole('dialog', {name:'서버 수정'})
  fireEvent.change(within(dialog).getByLabelText('서버 이름'), {target:{value:'새 이름'}})
  fireEvent.change(within(dialog).getByLabelText('호스트'), {target:{value:'new.test'}})
  fireEvent.click(within(dialog).getByRole('button', {name:'저장'}))
  expect(screen.getByRole('tab',{name:'새 이름'})).toBeInTheDocument()
  expect(ssh.open).toHaveBeenCalledTimes(1)
  fireEvent.click(button('서버 선택'))
  expect(screen.getAllByRole('menuitem')[0]).toHaveTextContent('새 터미널…')
  fireEvent.click(screen.getByRole('menuitem',{name:'새 이름'}))
  expect(ssh.open.mock.calls.map(([, endpoint]) => endpoint.host)).toEqual(['dev.test','new.test'])
  expect(JSON.parse(localStorage.getItem(libraryKey)!).profiles[0].id).toBe('a')
})

it('drops a saved server onto the empty workspace and a pane edge while keeping the original connection', () => {
  render(<TermRail active/>)
  drop('개발', screen.getByText('서버를 여기에 놓으세요').parentElement!, 100, 50)
  const dev = screen.getByTestId('session')
  const id = dev.textContent!
  drop('검증', dev.closest('.termrail-leaf')!, 100, 90)
  expect(screen.getByRole('separator')).toHaveAttribute('aria-orientation','horizontal')
  expect(screen.getAllByTestId('session')[0]).toHaveTextContent(id)
  expect(ssh.open).toHaveBeenCalledTimes(2)
  expect(ssh.close).not.toHaveBeenCalled()
})

it('replaces all windows even when reopening the selected layout and isolates a failed session', async () => {
  const tab = {titleProfileId:'a',title:'개발',tree:{kind:'pane' as const,pane:'a'}}
  seed([{name:'배치',layout:{tabs:[{...tab,titleProfileId:'b',title:'검증',tree:{kind:'pane',pane:'b'}}],selected:0,
    windows:[{tab,bounds:{x:0,y:0,width:640,height:480}}]}}])
  const w1 = popup(), w2 = popup()
  vi.mocked(openTermWindow).mockReturnValueOnce(w1).mockReturnValueOnce(w2)
  ssh.open.mockRejectedValueOnce(Error('실패'))
  render(<TermRail active/>)
  fireEvent.click(button('배치'))
  expect(await screen.findByRole('alert')).toHaveTextContent('SSH 연결을 시작할 수 없습니다.')
  const firstSession = within(w1.document.body).getByTestId('session').textContent
  fireEvent.click(button('배치'))
  expect(w1.close).toHaveBeenCalledOnce()
  expect(ssh.close).toHaveBeenCalledTimes(2)
  expect(ssh.open).toHaveBeenCalledTimes(4)
  expect(within(w2.document.body).getByTestId('session').textContent).not.toBe(firstSession)
  expect(screen.getAllByRole('tab')).toHaveLength(1)
  expect(screen.getByRole('tab', {name:'검증'})).toHaveAttribute('aria-selected','true')
  expect(screen.queryByRole('alert')).toBeNull()
  act(() => w2.close())
})

function tabCommand(name: string, action: string) {
  fireEvent.keyDown(screen.getByRole('tab', {name}), {key:'F10', shiftKey:true})
  fireEvent.click(screen.getByRole('menuitem', {name:action}))
}

it('keeps the work name through collapse, save, restore, split, and window moves', () => {
  const win = popup()
  vi.mocked(openTermWindow).mockReturnValue(win)
  render(<TermRail active/>)
  openDev()
  drop('검증', screen.getByTestId('session').closest('.termrail-leaf')!, 195, 50)
  tabCommand('작업 1 · 2', '작업 이름 변경…')
  fireEvent.change(screen.getByRole('textbox', {name:'작업 이름'}), {target:{value:'개발 점검'}})
  fireEvent.click(button('저장'))
  fireEvent.click(button('개발 터미널 닫기'))
  tabCommand('검증', '전체 작업 배치 저장…')
  fireEvent.change(screen.getByRole('textbox', {name:'레이아웃 이름'}), {target:{value:'점검 배치'}})
  fireEvent.click(button('저장'))
  fireEvent.click(button('점검 배치'))
  drop('개발', screen.getByTestId('session').closest('.termrail-leaf')!, 195, 50)
  tabCommand('개발 점검 · 2', '별도 창으로 열기')
  expect(win.document.title).toContain('개발 점검 · 2')
  act(() => win.close())
  expect(screen.getByRole('tab', {name:'개발 점검 · 2'})).toBeInTheDocument()
})

it('confirms closing only the selected work tab and focuses the surviving tab or opener', () => {
  const win = popup()
  vi.mocked(openTermWindow).mockReturnValue(win)
  render(<TermRail active/>)
  openDev()
  detachDev()
  const detachedId = within(win.document.body).getByTestId('session').textContent
  openDev()
  fireEvent.doubleClick(button('검증'))
  drop('개발', within(screen.getByRole('tabpanel')).getByTestId('session').closest('.termrail-leaf')!, 195, 50)
  const ids = within(screen.getByRole('tabpanel')).getAllByTestId('session').map(el => el.textContent)
  tabCommand('작업 3 · 2', '작업 탭 닫기')
  expect(screen.getByRole('dialog')).toHaveTextContent('작업 3의 터미널 2개를 종료할까요?')
  fireEvent.click(button('취소'))
  expect(ssh.close).not.toHaveBeenCalled()
  tabCommand('작업 3 · 2', '작업 탭 닫기')
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'닫기'}))
  expect(ssh.close.mock.calls.map(([id]) => id)).toEqual(ids)
  expect(screen.getByRole('tab',{name:'개발'})).toHaveFocus()
  tabCommand('개발', '작업 탭 닫기')
  expect(screen.queryByRole('tab')).toBeNull()
  expect(button('서버 선택')).toHaveFocus()
  expect(within(win.document.body).getByTestId('session')).toHaveTextContent(detachedId!)
  act(() => win.close())
})

it('counts only live connections when closing a split and preserves the saved layout', async () => {
  const tab = {titleProfileId:'a', title:'개발', tree:{kind:'split', direction:'row', ratio:.5,
    first:{kind:'pane', pane:'a'}, second:{kind:'pane', pane:'b'}}}
  seed([{name:'배치',layout:{tabs:[tab],selected:0,windows:[]}}])
  ssh.open.mockRejectedValueOnce(Error('실패'))
  render(<TermRail active/>)
  fireEvent.click(button('배치'))
  expect(await screen.findByRole('alert')).toHaveTextContent('SSH 연결을 시작할 수 없습니다.')
  tabCommand('작업 1 · 2', '작업 탭 닫기')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.queryByRole('tab')).toBeNull()
  expect(ssh.close).toHaveBeenCalledTimes(2)
  fireEvent.click(button('배치'))
  expect(screen.getByRole('tab', {name:'작업 1 · 2'})).toBeVisible()
})

it('preserves interrupted files when the saved profile library cannot be read', () => {
  localStorage.setItem(libraryKey, '{')
  render(<TermRail active/>)
  expect(screen.getByRole('alert')).toHaveTextContent('읽을 수 없습니다')
  expect(ssh.recoverStartup).not.toHaveBeenCalled()
})

it('discards the registered file only after deletion is persisted', () => {
  const profile = {...profiles[0], startup:{id:'old-file', name:'check.sh'}}
  localStorage.setItem(libraryKey, JSON.stringify({profiles:[profile], layouts:[]}))
  render(<TermRail active/>)
  fireEvent.contextMenu(button('개발'))
  fireEvent.click(screen.getByRole('menuitem', {name:'서버 삭제…'}))
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {throw Error('저장 실패')})
  try {
    fireEvent.click(button('삭제'))
    expect(screen.getByRole('alert')).toHaveTextContent('저장할 수 없습니다')
    expect(ssh.discardStartup).not.toHaveBeenCalled()
    fireEvent.click(button('삭제'))
    expect(screen.queryByRole('button', {name:'개발'})).toBeNull()
    expect(ssh.discardStartup).toHaveBeenCalledExactlyOnceWith('old-file')
  } finally {write.mockRestore()}
})

it('opens every saved transport with manual authentication and gives each scripted pane its login option', () => {
  const scripted = {...profiles[0], startup:{id:'3c857bcf-976b-46e6-b362-362f2f3810ba',name:'check.sh'}}
  const tab = (pane: string) => ({titleProfileId:pane,title:'서버',tree:{kind:'pane',pane}})
  localStorage.setItem(libraryKey,JSON.stringify({profiles:[scripted,profiles[1]],layouts:[
    {name:'전체',layout:{tabs:[tab('a'),tab('b'),tab('a')],selected:0,windows:[]}},
  ]}))
  render(<TermRail active/>)
  fireEvent.click(button('전체'))
  expect(ssh.open.mock.calls.map(([, endpoint]) => endpoint)).toEqual([
    {host:'dev.test',port:22}, {host:'qa.test',port:2222}, {host:'dev.test',port:22},
  ])
  expect(screen.getAllByTestId('session').map(pane => pane.dataset.startupId)).toEqual([
    scripted.startup.id, undefined, scripted.startup.id,
  ])
  fireEvent.doubleClick(button('개발'))
  expect(ssh.open.mock.calls[3][1]).toEqual({host:'dev.test',port:22,startupId:scripted.startup.id})
})
