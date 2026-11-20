import {Terminal} from '@xterm/xterm'
import {FitAddon} from '@xterm/addon-fit'
import type {TermRailSshApi, TermRailSshRead} from '../../shared/termrail-ssh'

export type TerminalStatus = Pick<TermRailSshRead, 'phase' | 'host' | 'port' | 'fingerprint' | 'previousFingerprint' | 'message' | 'startupInput'>
export const initialStatus: TerminalStatus = {phase: 'connecting', host: '', port: 22}

const terminalTheme = (doc: Document) => doc.documentElement.dataset.theme === 'dark'
  ? {background: '#171d22', foreground: '#e2ebef', cursor: '#a8d6bc', selectionBackground: '#455d70'}
  : {background: '#f4f9f6', foreground: '#16382e', cursor: '#20654f', selectionBackground: '#bed8ce'}

class SessionTerminal {
  readonly term: Terminal
  private readonly fit = new FitAddon()
  private status = initialStatus
  private truncated = false
  private observed = false
  private disposed = false
  private bridgeFailed = false
  private cursor = 0
  private timer?: ReturnType<typeof setTimeout>
  private writes: Promise<void> = Promise.resolve()
  private listener?: (status: TerminalStatus, truncated: boolean) => void
  private size?: {cols: number; rows: number}

  constructor(private readonly api: TermRailSshApi, private readonly sessionId: string) {
    this.term = new Terminal({
      // Even terminals first opened in a floating window may outlive it.
      documentOverride: document, cursorBlink: true, scrollback: 4000, disableStdin: true, logLevel: 'off',
      fontFamily: 'Consolas, "D2Coding", "Malgun Gothic", monospace', fontSize: 13,
    })
    this.term.loadAddon(this.fit)
    this.term.onData(data => this.send(new TextEncoder().encode(data)))
    this.term.onBinary(data => this.send(Uint8Array.from(data, char => char.charCodeAt(0))))
    this.term.onResize(({cols, rows}) => this.resize(cols, rows))
  }

  attach(host: HTMLElement, update: NonNullable<SessionTerminal['listener']>) {
    this.listener = update
    const doc = host.ownerDocument
    this.term.options.theme = terminalTheme(doc)
    // xterm keeps the screen, parser, scrollback and keyboard queue. After DOM
    // adoption open() rebinds its DPR, window and rendering services.
    const previous = this.term.element
    if (previous && previous.ownerDocument !== doc) {
      // xterm 6.0 keeps the previous window's outstanding animation-frame ID
      // across open(). A closed window never fires it, leaving all future
      // draws pending. Release that frame while its scheduling window is
      // still selected, then request a complete draw in the destination.
      const core = (this.term as Terminal & {
        _core: {_renderService: {_renderDebouncer: {dispose(): void}}}
      })._core
      core._renderService._renderDebouncer.dispose()
    }
    if (previous) host.appendChild(previous)
    this.term.open(host)
    if (previous) this.term.refresh(0, this.term.rows - 1)
    const measure = () => { if (host.clientWidth && host.clientHeight) this.fit.fit() }
    const observer = new ResizeObserver(measure)
    observer.observe(host)
    const appearance = new MutationObserver(() => {this.term.options.theme = terminalTheme(doc)})
    appearance.observe(doc.documentElement, {attributes:true, attributeFilter:['data-theme']})
    measure()
    update(this.status, this.truncated)
    if (!this.observed) {
      this.observed = true
      void this.read()
    }
    return () => {
      this.listener = undefined
      observer.disconnect()
      appearance.disconnect()
    }
  }

  private resize(cols: number, rows: number) {
    if (!this.observed || this.disposed || this.status.phase === 'closed' || this.status.phase === 'failed') return
    if (this.size?.cols === cols && this.size.rows === rows) return
    this.size = {cols, rows}
    void this.api.resize(this.sessionId, cols, rows).catch(() => this.fail())
  }

  private send(bytes: Uint8Array) {
    if (this.status.phase !== 'connected') return
    this.writes = this.writes.then(async () => {
      for (let offset = 0; offset < bytes.length && !this.disposed && this.status.phase === 'connected'; offset += 65536) {
        await this.api.write(this.sessionId, bytes.subarray(offset, offset + 65536))
      }
    }).catch(() => this.fail())
  }

  private fail() {
    if (this.disposed) return
    this.bridgeFailed = true
    this.term.options.disableStdin = true
    this.status = {...this.status, phase: 'failed', message: '터미널 세션에 접근할 수 없습니다.'}
    this.listener?.(this.status, this.truncated)
    clearTimeout(this.timer)
  }

  private async read() {
    try {
      const frame = await this.api.read(this.sessionId, this.cursor)
      if (this.disposed || this.bridgeFailed) return
      const previous = this.status
      const {phase, host, port, fingerprint, previousFingerprint, message, startupInput} = frame
      const changed = phase !== previous.phase || startupInput !== previous.startupInput || host !== previous.host || port !== previous.port ||
        message !== previous.message || fingerprint !== previous.fingerprint || previousFingerprint !== previous.previousFingerprint
      if (changed) {
        this.status = {phase, host, port, fingerprint, previousFingerprint, message, startupInput}
        this.term.options.disableStdin = phase !== 'connected'
      }
      if (frame.truncated) {
        this.term.reset()
        this.truncated = true
      }
      if (changed || frame.truncated) this.listener?.(this.status, this.truncated)
      this.resize(this.term.cols, this.term.rows)
      if (frame.data.length) await new Promise<void>(done => this.term.write(frame.data, done))
      if (this.disposed || this.bridgeFailed) return
      this.cursor = frame.nextCursor
      if (frame.more) void this.read()
      else if (phase !== 'closed' && phase !== 'failed') this.timer = setTimeout(() => void this.read(), 75)
    } catch {
      this.fail()
    }
  }

  dispose() {
    this.disposed = true
    clearTimeout(this.timer)
    this.term.dispose()
  }
}

// A React portal move unmounts and mounts its subtree in the same commit.
// Keep each emulator available across that handoff, then release removed panes.
const sessions = new Map<string, {session: SessionTerminal; cleanup?: ReturnType<typeof setTimeout>}>()

export function attachTerminal(api: TermRailSshApi, sessionId: string, host: HTMLElement,
  update: (status: TerminalStatus, truncated: boolean) => void) {
  const entry = sessions.get(sessionId) ?? {session: new SessionTerminal(api, sessionId)}
  sessions.set(sessionId, entry)
  clearTimeout(entry.cleanup)
  const detach = entry.session.attach(host, update)
  return {
    terminal: entry.session.term,
    release() {
      detach()
      entry.cleanup = setTimeout(() => {
        entry.session.dispose()
        sessions.delete(sessionId)
      }, 0)
    },
  }
}
