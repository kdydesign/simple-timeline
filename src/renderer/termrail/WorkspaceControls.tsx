import {useLayoutEffect, useRef, useState, type FormEvent} from 'react'
import {hostError, portError} from '../../shared/termrail-endpoint'
import type {Profile} from './layout'
import {useStartupFile} from './useStartupFile'
import './workspace-dialog.css'

export type CommandMenu = {anchor: HTMLElement; x: number; y: number; items: [string, () => void][]}
export function Menu({menu, dismiss}: {menu: CommandMenu; dismiss: () => void}) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = ref.current!
    const bounds = element.getBoundingClientRect()
    element.style.left = Math.max(0, Math.min(menu.x, innerWidth - bounds.width)) + 'px'
    element.style.top = Math.max(0, Math.min(menu.y, innerHeight - bounds.height)) + 'px'
    element.querySelector('button')?.focus()
    const outside = (event: PointerEvent) => {if (!element.contains(event.target as Node)) dismiss()}
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [menu])
  return <div className="termrail-menu" role="menu" aria-label="작업 메뉴" ref={ref}
    onBlur={e => {if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) dismiss()}}
    onKeyDown={e => {
      const buttons = [...e.currentTarget.querySelectorAll('button')]
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
      if (e.key === 'Escape') {e.preventDefault(); e.stopPropagation(); dismiss(); menu.anchor.focus(); return}
      const next = e.key === 'ArrowDown' ? (index + 1) % buttons.length
        : e.key === 'ArrowUp' ? (index + buttons.length - 1) % buttons.length
        : e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : -1
      if (next !== -1) {e.preventDefault(); buttons[next].focus()}
    }}>
    {menu.items.map(([label, action], index) => <button key={index} role="menuitem" type="button" onClick={() => {dismiss(); action()}}>{label}</button>)}
  </div>
}

export type Editor =
  | {kind: 'add' | 'connect'; anchor: HTMLElement}
  | {kind: 'edit' | 'delete'; profile: Profile; anchor: HTMLElement}
  | {kind: 'layout'; name: string; anchor: HTMLElement}

type Field = 'name' | 'host' | 'port'

export function WorkspaceDialog({editor, profiles, close, saveProfile, saveLayout, removeProfile, report}: {
  editor: Editor; profiles: Profile[]; close: () => void
  saveProfile: (profile: Profile, connect: boolean) => void; saveLayout: (name: string) => void
  removeProfile: (profile: Profile) => void; report?: (message: string) => void
}) {
  const source = 'profile' in editor ? editor.profile : undefined
  const layout = editor.kind === 'layout'
  const server = !layout && editor.kind !== 'delete'
  const [name, setName] = useState(layout ? editor.name : source?.name ?? '')
  const [host, setHost] = useState(source?.host ?? '')
  const [port, setPort] = useState(String(source?.port ?? 22))
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [error, setError] = useState('')
  const ref = useRef<HTMLDialogElement>(null)
  const heading = layout ? '레이아웃 저장' : editor.kind === 'edit' ? '서버 수정'
    : editor.kind === 'delete' ? '서버 삭제' : editor.kind === 'connect' ? '새 터미널' : '서버 추가'
  const endpoint = {host: host.trim(), port: Number(port)}
  const startup = useStartupFile(source, endpoint, report ?? setError)

  useLayoutEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    dialog.querySelector('input')?.select()
    return () => dialog.close()
  }, [])

  function dismiss() {close(); editor.anchor.focus()}
  function fieldError(field: Field) {
    if (field === 'host') return hostError(endpoint.host)
    if (field === 'port') return portError(port)
    const trimmed = name.trim()
    if (!trimmed) return '이름을 입력하세요.'
    return server && profiles.some(p => p.id !== source?.id && p.name === trimmed) ? '이미 사용 중인 서버 이름입니다.' : ''
  }
  function validate(fields: Field[]) {
    const next = Object.fromEntries(fields.map(field => [field, fieldError(field)]))
    setErrors(old => ({...old, ...next}))
    const first = fields.find(field => next[field])
    if (first) ref.current?.querySelector<HTMLInputElement>('input[name="' + first + '"]')?.focus()
    return !first
  }
  function input(field: Field, label: string, value: string, update: (value: string) => void, maxLength?: number) {
    const id = 'termrail-field-' + field
    return <div className="termrail-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={field} required disabled={startup.busy} value={value} maxLength={maxLength}
        autoFocus={field === 'name'} inputMode={field === 'port' ? 'numeric' : undefined}
        aria-invalid={errors[field] ? true : undefined} aria-describedby={errors[field] ? id + '-error' : undefined}
        onChange={e => {update(e.target.value); setErrors(old => ({...old, [field]: ''}))}}
        onBlur={() => {if (!server || value.trim()) setErrors(old => ({...old, [field]: fieldError(field)}))}}/>
      {errors[field] && <span id={id + '-error'} role="alert">{errors[field]}</span>}
    </div>
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (startup.busy) return
    setError('')
    try {
      if (editor.kind === 'delete') removeProfile(editor.profile)
      else if (layout) {
        if (!validate(['name'])) return
        saveLayout(name.trim())
      } else {
        if (!validate(['name', 'host', 'port'])) return
        await startup.save(file => {
          saveProfile({id: source?.id ?? crypto.randomUUID(), name: name.trim(), ...endpoint,
            ...(file ? {startup: file} : {})}, editor.kind === 'connect')
        }, dismiss)
        return
      }
      dismiss()
    } catch (cause) {setError(cause instanceof Error ? cause.message : '저장할 수 없습니다.')}
  }
  return <dialog ref={ref} aria-label={heading} className="termrail-dialog termrail-workspace-dialog" data-standard-dialog={editor.kind === 'add' || layout || undefined} onCancel={e => {e.preventDefault(); dismiss()}}>
    <form noValidate onSubmit={submit}>
      <h3>{heading}</h3>
      {editor.kind === 'delete' ? <p>‘{editor.profile.name}’ 서버를 삭제할까요? 이 서버를 사용하는 저장된 레이아웃은 열 수 없게 됩니다.</p>
        : input('name', layout ? '레이아웃 이름' : '서버 이름', name, setName, layout ? 40 : 60)}
      {layout && <p className="termrail-layout-description">모든 작업 탭, 분할 비율, 별도 창 배치를 함께 저장합니다.</p>}
      {server && <>
        <div className="termrail-endpoint">
          {input('host', '호스트', host, setHost)}
          {input('port', '포트', port, setPort)}
        </div>
        <div className="termrail-startup" role="group" aria-label="시작 파일">
          <span className="termrail-startup-label">시작 파일 <small>(선택)</small></span>
          <span className="termrail-file-name" title={startup.name}>{startup.name ?? '선택한 파일 없음'}</span>
          <button type="button" aria-label="시작 파일 가져오기" disabled={startup.busy}
            title="UTF-8 파일의 첫 두 줄에 # workrail-user: 아이디와 # workrail-password: 비밀번호를 적고 다음 줄부터 Bash 명령을 적으세요."
            onClick={() => void startup.pick()}>가져오기</button>
          {startup.name && <button type="button" aria-label="시작 파일 제거" disabled={startup.busy} onClick={startup.remove}>×</button>}
        </div>
        {startup.endpointChanged && <p role="status">주소나 포트가 바뀌었습니다. 시작 파일을 사용하려면 다시 가져오세요.</p>}
        {startup.pickError && <p role="alert">{startup.pickError}</p>}
      </>}
      {error && <p role="alert">{error}</p>}
      <div className="termrail-actions"><button type="button" onClick={dismiss}>취소</button>
        <button type="submit" disabled={startup.busy}>{editor.kind === 'connect' ? '저장하고 연결' : editor.kind === 'delete' ? '삭제' : '저장'}</button></div>
    </form>
  </dialog>
}
