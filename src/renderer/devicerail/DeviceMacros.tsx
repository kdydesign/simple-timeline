import { KeyRound, Pencil, Play, Plus, Trash2, Unplug } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { DeviceMacro, DeviceMacroRun, RailDevice } from '../../shared/device-rail'
import { DeviceTime } from './DeviceStatus'
import { deviceError, type DeviceRailController } from './useDeviceRail'

const phaseLabels: Record<DeviceMacroRun['phase'], string> = {
  connecting: '연결 중', 'host-key': '호스트 키 확인', login: '로그인 대기', running: '실행 중',
  succeeded: '성공', failed: '실패', uncertain: '연결 종료 · 결과 확인 필요', cancelled: '취소됨',
}
function active(run: DeviceMacroRun) {
  return run.phase === 'connecting' || run.phase === 'host-key' || run.phase === 'login' || run.phase === 'running'
}
export function endpoint(host: string, port: number) { return (host.includes(':') ? '[' + host + ']' : host) + ':' + port }

function RunAuth({ rail, run }: { rail: DeviceRailController; run: DeviceMacroRun }) {
  const [username, setUsername] = useState(run.account ?? '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const trust = run.phase === 'host-key'
  const fingerprint = run.fingerprint
  async function respond(event: FormEvent, cancel = false) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      if (cancel) await rail.perform(api => api.disconnect(run.deviceId))
      else if (trust && fingerprint) await rail.perform(api => api.trust(run.deviceId, run.id, fingerprint))
      else if (run.phase === 'login') await rail.perform(api => api.login(run.deviceId, run.id, username.trim(), password))
    } catch (cause) { setError(deviceError(cause)) }
    finally { setPassword(''); setBusy(false) }
  }
  return <form className="device-auth" onSubmit={respond} aria-label={trust ? '호스트 키 확인' : '매크로 로그인'}>
    <strong><KeyRound size={14} aria-hidden="true"/>{trust ? (run.previousFingerprint ? '호스트 키 변경' : '호스트 키 확인') : '매크로 로그인'}</strong>
    <p>{run.deviceName} <span className="device-mono">{endpoint(run.host, run.port)}</span></p>
    {trust ? <>
      {run.previousFingerprint && <p>이전 지문 <code>{run.previousFingerprint}</code></p>}
      <p>현재 지문 <code>{run.fingerprint}</code></p>
      <p>장비 관리자가 제공한 지문과 일치하는지 확인하세요.</p>
    </> : <>
      <label>SSH 계정<input required maxLength={256} autoCapitalize="none" autoComplete="off" spellCheck={false} value={username} onChange={e => setUsername(e.target.value)}/></label>
      <label>비밀번호<input type="password" maxLength={4096} autoComplete="off" value={password} onChange={e => setPassword(e.target.value)}/></label>
    </>}
    {error && <p className="device-error" role="alert">{error}</p>}
    <div className="device-action-bar">
      <button type="button" className="workrail-control" disabled={busy} onClick={e => { void respond(e, true) }}>취소</button>
      <button type="submit" className="workrail-control workrail-primary" disabled={busy || (trust ? !run.fingerprint : !username.trim())}>
        {trust ? '지문 승인' : '로그인'}
      </button>
    </div>
  </form>
}

function RunResult({ run }: { run: DeviceMacroRun }) {
  const [expanded, setExpanded] = useState(false)
  return <details className="device-macro-result" onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary>{run.macroName} · {phaseLabels[run.phase]} · <DeviceTime at={run.startedAt}/></summary>
    {expanded && <>
      <p>{run.deviceName} <span className="device-mono">{endpoint(run.host, run.port)}</span>{run.account && ' · ' + run.account}</p>
      <p>시작 <DeviceTime at={run.startedAt}/>{run.finishedAt != null && <> · 종료 <DeviceTime at={run.finishedAt}/></>}</p>
      {run.exitCode != null && <p>종료 코드 {run.exitCode}</p>}
      {run.message && run.message !== '종료 코드 ' + run.exitCode && run.message !== phaseLabels[run.phase] && <p>{run.message}</p>}
      <h4>표준 출력</h4><pre className="device-code">{run.stdout || '출력 없음'}</pre>
      <h4>표준 오류</h4><pre className="device-code">{run.stderr || '출력 없음'}</pre>
      {run.truncated && <p>출력이 길어 일부만 표시합니다.</p>}
    </>}
  </details>
}

export function DeviceMacros({ device, rail, edit, remove }: {
  device: RailDevice; rail: DeviceRailController; edit: (macro?: DeviceMacro) => void; remove: (macro: DeviceMacro) => void
}) {
  const state = rail.snapshot.macroState[device.id]
  const runs = [...(state?.runs ?? [])].sort((a,b) => b.startedAt - a.startedAt)
  const pending = runs.find(active)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  async function start(macro: DeviceMacro) {
    if (sending || pending) return
    setSending(true)
    setError('')
    try { await rail.perform(api => api.runMacro(device.id, macro.id)) }
    catch (cause) { setError(deviceError(cause)) }
    finally { setSending(false) }
  }
  async function disconnect() {
    setError('')
    try { await rail.perform(api => api.disconnect(device.id)) }
    catch (cause) { setError(deviceError(cause)) }
  }
  return <section aria-label="장비 매크로">
    <header className="device-section-head"><h4>매크로</h4>
      <button className="workrail-link" type="button" onClick={() => edit()}><Plus size={13} aria-hidden="true"/>매크로 추가</button>
    </header>
    {(state?.account || pending?.phase === 'connecting') && <div className="device-session">
      <span>{state?.account ? state.account + ' · 연결됨' : '연결 중'}</span>
      <button type="button" className="workrail-link" onClick={() => void disconnect()}><Unplug size={12} aria-hidden="true"/>연결 해제</button>
    </div>}
    {device.macros.length ? <ul className="device-macro-list">{device.macros.map(macro => {
      const last = runs.find(run => run.macroId === macro.id)
      return <li key={macro.id} className="device-macro-row">
        <button type="button" className="workrail-control device-macro-name" disabled={!!pending || sending}
          onClick={() => void start(macro)}><Play size={12} aria-hidden="true"/>{macro.name}</button>
        {last && <small>{phaseLabels[last.phase]}</small>}
        <button type="button" aria-label={macro.name + ' 수정'} className="device-icon-button" onClick={() => edit(macro)}><Pencil size={14}/></button>
        <button type="button" aria-label={macro.name + ' 삭제'} className="device-icon-button" onClick={() => remove(macro)}><Trash2 size={14}/></button>
      </li>
    })}</ul> : <p className="device-sub">저장한 매크로가 없습니다.</p>}
    {error && <p className="device-error" role="alert">{error}</p>}
    {pending && (pending.phase === 'host-key' || pending.phase === 'login') && <RunAuth key={pending.id + pending.phase} rail={rail} run={pending}/>}
    {runs.length > 0 && <section aria-label="매크로 실행 기록">{runs.map(run => <RunResult key={run.id} run={run}/>)}</section>}
  </section>
}
