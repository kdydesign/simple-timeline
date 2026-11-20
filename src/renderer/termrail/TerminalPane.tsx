import {useEffect, useLayoutEffect, useRef, useState, type FormEvent} from 'react'
import type {Terminal} from '@xterm/xterm'
import {attachTerminal, initialStatus, type TerminalStatus} from './terminal-session'
import '@xterm/xterm/css/xterm.css'
import './terminal-pane.css'

interface PaneProps {
  sessionId: string
  startupId?: string
  active?: boolean
  onClose(): void
  onEnded?(): void
}

function LoginPrompt({active, onLogin, onStartup}: {
  active?: boolean; onLogin: (username: string, password: string) => Promise<void>; onStartup?: () => Promise<void>
}) {
  const [username, setUsername] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [fileError, setFileError] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useLayoutEffect(() => {
    const field = input.current
    if (active && field && !field.ownerDocument.activeElement?.closest('[role="menu"], dialog[open]')) field.focus()
  }, [active, username, submitted])

  function submit(event: FormEvent) {
    event.preventDefault()
    const field = input.current
    if (!field || submitted) return
    const value = field.value
    field.value = ''
    if (username === null) {
      if (!value.trim()) return
      setUsername(value)
      return
    }
    setSubmitted(true)
    void onLogin(username, value)
    setUsername(null)
  }

  if (submitted) return <span role="status">인증 중…</span>
  const password = username !== null
  return <form className="termrail-login" onSubmit={submit} autoComplete="off">
    <label>
      {password ? 'Password:' : 'login as:'}
      <input key={password ? 'password' : 'username'} ref={input} type={password ? 'password' : 'text'}
        autoComplete={password ? 'new-password' : 'off'} autoCapitalize="none" spellCheck={false}
        maxLength={password ? 4096 : 256}
        onCopy={password ? event => event.preventDefault() : undefined}
        onCut={password ? event => event.preventDefault() : undefined}
        onDragStart={password ? event => event.preventDefault() : undefined} />
    </label>
    {onStartup && !password && <button type="button" onClick={() => {
      setSubmitted(true)
      setFileError(false)
      void onStartup().catch(() => {setSubmitted(false); setFileError(true)})
    }}>시작 파일로 로그인</button>}
    {fileError && <p role="alert">시작 파일로 로그인할 수 없습니다. 직접 로그인하거나 서버의 시작 파일을 확인하세요.</p>}
  </form>
}

function HostKeyPrompt({status, trust, onClose}: {status: TerminalStatus; trust(): Promise<void>; onClose(): void}) {
  const [submitted, setSubmitted] = useState(false)
  return <section className="termrail-host-key" aria-label="SSH 호스트 키 확인">
    <strong>{status.previousFingerprint ? '서버의 호스트 키가 변경되었습니다.' : '처음 연결하는 서버입니다.'}</strong>
    <span>{status.host}:{status.port}</span>
    {status.previousFingerprint && <span>기존 지문 {status.previousFingerprint}</span>}
    <span>서버 지문 {status.fingerprint}</span>
    <span>서버 관리자가 제공한 지문과 일치하는지 확인하세요.</span>
    <div>
      <button type="button" onClick={onClose}>거부</button>
      <button type="button" disabled={submitted || !status.fingerprint}
        onClick={() => {setSubmitted(true); void trust()}}>
        {status.previousFingerprint ? '변경된 키 신뢰' : '키 신뢰'}
      </button>
    </div>
  </section>
}

function SessionPane({sessionId, startupId, active, onClose, onEnded}: PaneProps) {
  const mount = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const terminal = useRef<Terminal | null>(null)
  const [status, setStatus] = useState<TerminalStatus>(initialStatus)
  const [error, setError] = useState('')
  const [truncated, setTruncated] = useState(false)
  const api = window.termRailSsh

  useEffect(() => {
    const host = mount.current!
    if (!api) {
      setError('SSH 연결 서비스를 사용할 수 없습니다.')
      return
    }
    const attachment = attachTerminal(api, sessionId, host, (next, truncated) => {
      setStatus(next)
      setTruncated(truncated)
    })
    terminal.current = attachment.terminal
    return () => {
      terminal.current = null
      attachment.release()
    }
  }, [sessionId, api])

  const wasActive = useRef(false)
  useLayoutEffect(() => {
    const el = root.current!
    const doc = el.ownerDocument
    const shouldFocus = active && (!wasActive.current || doc.activeElement === doc.body || el.contains(doc.activeElement))
    wasActive.current = !!active
    if (!shouldFocus || status.phase === 'login') return
    if (status.phase === 'connected') terminal.current?.focus()
    else (el.querySelector<HTMLElement>('.termrail-host-key button') ?? el).focus()
  }, [active, status.phase])

  const connected = !error && status.phase === 'connected'
  const ended = status.phase === 'closed' || status.phase === 'failed' || !!error
  useEffect(() => {if (ended) onEnded?.()}, [ended, onEnded])
  const handleActionError = () => setError('SSH 연결 요청을 처리할 수 없습니다.')
  return <div ref={root} className="termrail-console" data-state={error ? 'failed' : status.phase}
    data-terminal-input={connected ? '' : undefined} tabIndex={-1}>
    <div ref={mount} className="termrail-xterm" style={{visibility: connected || ended ? 'visible' : 'hidden'}} />
    {truncated && <small className="termrail-transcript-note">최근 출력부터 표시합니다.</small>}
    {ended ? <div className="termrail-console-status" role="status">
      {error || status.message || (status.phase === 'closed' ? '연결이 종료되었습니다.' : '서버에 연결하지 못했습니다.')}
    </div> : !connected && <div className="termrail-console-prompt">
      {status.phase === 'login'
        ? <LoginPrompt active={active} onStartup={startupId ? () => api!.startProfile(sessionId, startupId) : undefined}
            onLogin={(username, password) => api!.login(sessionId, username, password).catch(handleActionError)} />
        : status.phase === 'host-key'
          ? <HostKeyPrompt key={status.fingerprint} status={status} onClose={onClose}
              trust={() => api!.trust(sessionId, status.fingerprint!).catch(handleActionError)} />
          : <span role="status">{status.phase === 'authenticating' ? '인증 중…' : '연결 중…'}</span>}
    </div>}
  </div>
}

export function TerminalPane(props: PaneProps) {
  return <SessionPane key={props.sessionId} {...props} />
}
