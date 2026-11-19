import {useLayoutEffect, useRef, useState, type FormEvent} from 'react'
import {validHost, type Profile} from './layout'

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

export function WorkspaceDialog({editor, profiles, close, saveProfile, saveLayout, removeProfile}: {
  editor: Editor; profiles: Profile[]; close: () => void
  saveProfile: (profile: Profile, connect: boolean) => void; saveLayout: (name: string) => void
  removeProfile: (profile: Profile) => void
}) {
  const source = 'profile' in editor ? editor.profile : undefined
  const [name, setName] = useState(editor.kind === 'layout' ? editor.name : source?.name ?? '')
  const [host, setHost] = useState(source?.host ?? '')
  const [port, setPort] = useState(String(source?.port ?? 22))
  const [error, setError] = useState('')
  const ref = useRef<HTMLDialogElement>(null)
  const heading = editor.kind === 'layout' ? '레이아웃 저장' : editor.kind === 'edit' ? '서버 수정'
    : editor.kind === 'delete' ? '서버 삭제' : editor.kind === 'connect' ? '새 터미널' : '서버 추가'
  useLayoutEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    const first = dialog.querySelector('input')
    first?.select()
    return () => dialog.close()
  }, [])
  function dismiss() {close(); editor.anchor.focus()}
  function submit(event: FormEvent) {
    event.preventDefault()
    try {
      const trimmed = name.trim()
      if (editor.kind === 'delete') removeProfile(editor.profile)
      else if (!trimmed) throw Error('이름을 입력하세요.')
      else if (editor.kind === 'layout') saveLayout(trimmed)
      else {
        if (profiles.some(p => p.id !== source?.id && p.name === trimmed)) throw Error('이미 사용 중인 서버 이름입니다.')
        if (!validHost(host.trim())) throw Error('호스트 이름 또는 IP 주소를 입력하세요.')
        const number = Number(port)
        if (!Number.isInteger(number) || number < 1 || number > 65535) throw Error('포트는 1부터 65535 사이의 정수로 입력하세요.')
        saveProfile({id: source?.id ?? crypto.randomUUID(), name: trimmed, host: host.trim(), port: number}, editor.kind === 'connect')
      }
      dismiss()
    } catch (cause) {setError(cause instanceof Error ? cause.message : '저장할 수 없습니다.')}
  }
  return <dialog ref={ref} aria-label={heading} className="termrail-dialog" onCancel={e => {e.preventDefault(); dismiss()}}>
    <form onSubmit={submit}>
      <h3>{heading}</h3>
      {editor.kind === 'delete'
        ? <p>‘{editor.profile.name}’ 서버를 삭제할까요? 이 서버를 사용하는 저장된 레이아웃은 열 수 없게 됩니다.</p>
        : <label>{editor.kind === 'layout' ? '레이아웃 이름' : '서버 이름'}
          <input autoFocus required maxLength={editor.kind === 'layout' ? 40 : 60} value={name} onChange={e => setName(e.target.value)}/>
        </label>}
      {editor.kind !== 'layout' && editor.kind !== 'delete' && <>
        <label>호스트<input required maxLength={253} value={host} onChange={e => setHost(e.target.value)}/></label>
        <label>포트<input required type="number" min={1} max={65535} value={port} onChange={e => setPort(e.target.value)}/></label>
      </>}
      {error && <p role="alert">{error}</p>}
      <div className="termrail-actions"><button type="button" onClick={dismiss}>취소</button>
        <button type="submit">{editor.kind === 'connect' ? '저장하고 연결' : editor.kind === 'delete' ? '삭제' : '저장'}</button></div>
    </form>
  </dialog>
}
