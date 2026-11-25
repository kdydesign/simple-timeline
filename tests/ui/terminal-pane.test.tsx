import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react'
import {afterEach, expect, it, vi} from 'vitest'
import {TerminalPane} from '../../src/renderer/termrail/TerminalPane'
import type {TermRailSshApi} from '../../src/shared/termrail-ssh'

const emulator = vi.hoisted(() => ({
  output: [] as string[],
  input: undefined as ((value: string) => void) | undefined,
  resized: undefined as ((size: {cols: number; rows: number}) => void) | undefined,
}))
// JSDOM has no canvas layout. Keep the Electron boundary and xterm's decoded
// keyboard/output interface observable without substituting the pane itself.
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 80
    rows = 24
    options = {}
    element?: HTMLElement
    open(host: HTMLElement) {
      if (this.element) return
      this.element = host.ownerDocument.createElement('div')
      this.element.className = 'xterm'
      host.appendChild(this.element)
    }
    loadAddon() {}
    dispose() {}
    reset() {}
    refresh() {}
    focus() {}
    write(bytes: Uint8Array, done: () => void) {
      emulator.output.push(new TextDecoder().decode(bytes))
      done()
    }
    onData(listener: typeof emulator.input) { emulator.input = listener }
    onBinary() {}
    onResize(listener: typeof emulator.resized) { emulator.resized = listener }
  },
}))
vi.mock('@xterm/addon-fit', () => ({FitAddon: class {fit() {}}}))

type Frame = Awaited<ReturnType<TermRailSshApi['read']>>
const frame = (phase: Frame['phase'], extra: Partial<Frame> = {}): Frame => ({
  phase, host: 'shell.test', port: 2222, data: new Uint8Array(), more: false,
  truncated: false, nextCursor: 0, ...extra,
})
function bridge(read: TermRailSshApi['read']) {
  const api = {read, open: vi.fn(), close: vi.fn(), trust: vi.fn().mockResolvedValue(undefined),
    login: vi.fn().mockResolvedValue(undefined), startProfile: vi.fn().mockResolvedValue(undefined), write: vi.fn().mockResolvedValue(undefined),
    resize: vi.fn().mockResolvedValue(undefined)}
  vi.stubGlobal('termRailSsh', api)
  return api
}
afterEach(() => {
  vi.unstubAllGlobals()
  emulator.output.length = 0
})

it('submits credentials only to the pane receiving input and clears its password field', async () => {
  const api = bridge(async () => frame('login'))
  render(<><TerminalPane sessionId="alpha" onClose={vi.fn()} /><TerminalPane sessionId="beta" onClose={vi.fn()} /></>)
  const login = (await screen.findAllByLabelText('login as:'))[1]
  fireEvent.change(login, {target: {value: 'operator'}})
  fireEvent.submit(login.closest('form')!)
  const password = screen.getByLabelText('Password:')
  expect(password).toHaveAttribute('type', 'password')
  fireEvent.change(password, {target: {value: 'session-secret'}})
  expect(fireEvent.copy(password)).toBe(false)
  fireEvent.submit(password.closest('form')!)
  expect(api.login).toHaveBeenCalledExactlyOnceWith('beta', 'operator', 'session-secret')
  expect(password).toHaveValue('')
  expect(api.write).not.toHaveBeenCalled()
  expect(emulator.output.join('')).not.toContain('session-secret')
})

it('focuses the selected login when other panes receive their prompts later', async () => {
  let showSecond!: (value: Frame) => void
  const waiting = new Promise<Frame>(resolve => {showSecond = resolve})
  bridge(async id => id === 'slow' ? waiting : frame('login'))
  const panes = (first: boolean) => <>
    <TerminalPane sessionId="fast" active={first} onClose={vi.fn()} />
    <TerminalPane sessionId="slow" active={!first} onClose={vi.fn()} />
  </>
  const view = render(panes(true))
  const first = await screen.findByLabelText('login as:')
  expect(first).toHaveFocus()
  await act(async () => {showSecond(frame('login'))})
  const second = screen.getAllByLabelText('login as:')[1]
  expect(first).toHaveFocus()
  view.rerender(panes(false))
  expect(second).toHaveFocus()
})

it('distinguishes authentication and opening the shell before reporting a shell failure', async () => {
  let state = frame('authenticating')
  bridge(async () => state)
  render(<TerminalPane sessionId="opening" onClose={vi.fn()}/>)
  expect(await screen.findByText('인증 중…')).toBeVisible()
  state = frame('opening-shell')
  expect(await screen.findByText('터미널 여는 중…')).toBeVisible()
  state = frame('failed', {message: '터미널을 열 수 없습니다.'})
  expect(await screen.findByText('터미널을 열 수 없습니다.')).toBeVisible()
})

it('shows prompt-wait and manual-input status alongside the interactive console', async () => {
  const output = new TextEncoder().encode('Proceed? ')
  let state = frame('connected', {startupInput:'waiting'})
  const api = bridge(async (_id, cursor) => ({...state, data: cursor ? new Uint8Array() : output, nextCursor:output.length}))
  const view = render(<TerminalPane sessionId="startup" onClose={vi.fn()}/>)
  expect(await screen.findByText('시작 명령 대기 중')).toBeVisible()
  const terminal = view.container.querySelector('.xterm')
  expect(terminal).toBeVisible()
  expect(emulator.output).toEqual(['Proceed? '])
  act(() => emulator.input!('y'))
  await waitFor(() => expect(api.write).toHaveBeenCalledWith('startup', new TextEncoder().encode('y')))
  state = frame('connected', {startupInput:'manual'})
  expect(await screen.findByText(/직접 입력/)).toBeVisible()
  expect(terminal).toBeVisible()
  act(() => emulator.input!('\r'))
  await waitFor(() => expect(api.write).toHaveBeenCalledWith('startup', new TextEncoder().encode('\r')))
})

it('removes the waiting indication when startup input finishes on the same connection', async () => {
  let state = frame('connected', {startupInput:'waiting'})
  bridge(async () => state)
  render(<TerminalPane sessionId="startup-finished" onClose={vi.fn()}/>)
  expect(await screen.findByText('시작 명령 대기 중')).toBeVisible()
  state = frame('connected')
  await waitFor(() => expect(screen.queryByText('시작 명령 대기 중')).toBeNull())
})

it('identifies a changed server key and trusts only the displayed fingerprint on explicit acceptance', async () => {
  const api = bridge(async () => frame('host-key', {fingerprint:'SHA256:new', previousFingerprint:'SHA256:old'}))
  const close = vi.fn()
  render(<TerminalPane sessionId="changed" onClose={close} />)
  expect(await screen.findByText(/shell\.test:2222/)).toBeInTheDocument()
  expect(screen.getByText(/SHA256:new/)).toBeInTheDocument()
  expect(screen.getByText(/SHA256:old/)).toBeInTheDocument()
  expect(api.trust).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'거부'}))
  expect(close).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button',{name:'변경된 키 신뢰'}))
  expect(api.trust).toHaveBeenCalledExactlyOnceWith('changed', 'SHA256:new')
})

it('resumes buffered PTY output from its cursor and sends terminal control input and resize to that session', async () => {
  const read = vi.fn(async (_id: string, cursor: number) => frame('connected',
    cursor === 0 ? {data:new TextEncoder().encode('output'),nextCursor:6,more:true} : {nextCursor:cursor}))
  const api = bridge(read)
  const view = render(<TerminalPane sessionId="connected" onClose={vi.fn()} />)
  await waitFor(() => expect(read).toHaveBeenCalledWith('connected', 6))
  expect(emulator.output).toEqual(['output'])
  act(() => {
    emulator.input!('\x1b[A\x03')
    emulator.resized!({cols:111,rows:37})
  })
  await waitFor(() => expect(api.write).toHaveBeenCalledOnce())
  const [id, data] = api.write.mock.calls[0]
  expect(id).toBe('connected')
  expect(typeof data === 'string' ? data : new TextDecoder().decode(data)).toBe('\x1b[A\x03')
  expect(api.resize).toHaveBeenCalledWith('connected', 111, 37)
  view.unmount()
  expect(api.close).not.toHaveBeenCalled()
})

it('keeps the emulator and byte cursor when a split or detached window moves the same session', async () => {
  const read = vi.fn(async (_id: string, cursor: number) => frame('connected',
    cursor === 0 ? {data:new TextEncoder().encode('once'), nextCursor:4, more:true} : {nextCursor:cursor}))
  bridge(read)
  const props = {sessionId:'moving',onClose:vi.fn()}
  const view = render(<section key="main"><TerminalPane {...props}/></section>)
  await waitFor(() => expect(read).toHaveBeenCalledWith('moving', 4))
  const emulatorElement = view.container.querySelector('.xterm')
  view.rerender(<section key="detached"><TerminalPane {...props}/></section>)
  await waitFor(() => expect(view.container.querySelector('[data-state="connected"]')).toBeInTheDocument())
  expect(read.mock.calls.filter(([, cursor]) => cursor === 0)).toHaveLength(1)
  expect(emulator.output).toEqual(['once'])
  expect(view.container.querySelector('.xterm')).toBe(emulatorElement)
})

it('drains remaining PTY output when the remote error arrives before its final output bytes', async () => {
  bridge(async (_id, cursor) => frame('failed', cursor === 0
    ? {data:new TextEncoder().encode('first'), nextCursor:5, more:true}
    : {data:new TextEncoder().encode('last'), nextCursor:9}))
  render(<TerminalPane sessionId="drain-error" onClose={vi.fn()} />)
  await waitFor(() => expect(emulator.output).toEqual(['first', 'last']))
})

it('offers stored login only after host verification and applies it to one existing session on click', async () => {
  const phases: Record<string,Frame['phase']> = {left:'host-key',right:'host-key'}
  const api = bridge(async id => frame(phases[id], {fingerprint:'SHA256:restored'}))
  render(<><section aria-label="왼쪽 터미널"><TerminalPane sessionId="left" startupId="left-file" onClose={vi.fn()}/></section>
    <section aria-label="오른쪽 터미널"><TerminalPane sessionId="right" startupId="right-file" onClose={vi.fn()}/></section></>)
  const left = within(screen.getByRole('region',{name:'왼쪽 터미널'}))
  const right = within(screen.getByRole('region',{name:'오른쪽 터미널'}))
  await Promise.all([left.findByText(/SHA256:restored/),right.findByText(/SHA256:restored/)])
  const login = {name:'시작 파일로 로그인'}
  expect(screen.queryByRole('button',login)).toBeNull()
  phases.left = 'login'
  await left.findByRole('button',login)
  expect(right.queryByRole('button',login)).toBeNull()
  phases.right = 'login'
  const button = await right.findByRole('button',login)
  expect(api.startProfile).not.toHaveBeenCalled()
  fireEvent.click(button)
  expect(api.startProfile).toHaveBeenCalledExactlyOnceWith('right', 'right-file')
  expect(api.open).not.toHaveBeenCalled()
})

it('leaves the login prompt available when the registered file cannot be loaded', async () => {
  const api = bridge(async () => frame('login'))
  api.startProfile.mockRejectedValueOnce(Error('unavailable'))
  render(<TerminalPane sessionId="recovery" startupId="missing-file" onClose={vi.fn()}/>)
  fireEvent.click(await screen.findByRole('button', {name:'시작 파일로 로그인'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('시작 파일')
  expect(screen.getByLabelText('login as:')).toBeEnabled()
})
