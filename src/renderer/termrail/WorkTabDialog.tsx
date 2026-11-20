import {useLayoutEffect, useRef, useState} from 'react'

export type WorkTabAction = {id: string; name: string; anchor: HTMLElement} & (
  {kind: 'rename'} | {kind: 'close'; count: number}
)

export function WorkTabDialog({action, dismiss, apply}: {
  action: WorkTabAction; dismiss(): void; apply(name: string): void
}) {
  const [name, setName] = useState(action.name)
  const dialog = useRef<HTMLDialogElement>(null)
  const rename = action.kind === 'rename'
  const heading = rename ? '작업 이름 변경' : '작업 탭 닫기'
  useLayoutEffect(() => {
    const el = dialog.current!
    el.showModal()
    if (rename) el.querySelector('input')?.select()
    else el.querySelector('button')?.focus()
    return () => el.close()
  }, [rename])
  function cancel() {
    dialog.current?.close()
    dismiss()
    action.anchor.focus()
  }
  return <dialog ref={dialog} className="termrail-dialog" aria-label={heading}
    onCancel={event => {event.preventDefault(); cancel()}}>
    <form onSubmit={event => {
      event.preventDefault()
      if (rename && !name.trim()) return
      dialog.current?.close()
      apply(name.trim())
    }}>
      <h3>{heading}</h3>
      {rename ? <label>작업 이름<input autoFocus maxLength={60} value={name} onChange={event => setName(event.target.value)}/></label>
        : <p>{action.name}의 터미널 {action.count}개를 종료할까요?</p>}
      <div className="termrail-actions">
        <button type="button" onClick={cancel}>취소</button>
        <button type="submit" disabled={rename && !name.trim()}>{rename ? '저장' : '닫기'}</button>
      </div>
    </form>
  </dialog>
}
