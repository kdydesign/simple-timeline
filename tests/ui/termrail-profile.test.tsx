import {act, fireEvent, render, screen} from '@testing-library/react'
import {afterEach, expect, it, vi} from 'vitest'
import {WorkspaceDialog, type Editor} from '../../src/renderer/termrail/WorkspaceControls'

HTMLDialogElement.prototype.showModal ??= function () { this.open = true }
HTMLDialogElement.prototype.close ??= function () { this.open = false }
afterEach(() => vi.unstubAllGlobals())

const profile = {id:'dev', name:'개발', host:'dev.example', port:22, startup:{id:'original', name:'dev.sh'}}
const draft = {id:'draft', name:'new.sh'}
const anchor = document.createElement('button')
function editorDialog(editor: Editor = {kind:'edit', profile, anchor}) {
  const saveProfile = vi.fn()
  const close = vi.fn()
  const result = render(<WorkspaceDialog editor={editor} profiles={[profile]} close={close}
    saveLayout={vi.fn()} saveProfile={saveProfile} removeProfile={vi.fn()}/>)
  return {...result, saveProfile, close}
}
const change = (field: string, value: string) => fireEvent.change(screen.getByLabelText(field), {target:{value}})
const click = (name: string) => fireEvent.click(screen.getByRole('button',{name}))

it('shows errors on blur and submit, focuses the first invalid field, then saves the corrected IPv6 endpoint', () => {
  const {saveProfile} = editorDialog({kind:'connect', anchor})
  change('서버 이름', '   ')
  change('호스트', 'dev.example:2200')
  change('포트', '1e2')
  expect(screen.queryByRole('alert')).toBeNull()
  fireEvent.blur(screen.getByLabelText('호스트'))
  expect(screen.getByLabelText('호스트')).toHaveAccessibleDescription(/포트/)
  click('저장하고 연결')
  expect(screen.getByLabelText('서버 이름')).toHaveFocus()
  expect(screen.getByLabelText('포트')).toHaveValue('1e2')
  expect(screen.getByLabelText('포트')).toHaveAccessibleDescription(/정수/)
  change('서버 이름', '개발')
  click('저장하고 연결')
  expect(screen.getByLabelText('서버 이름')).toHaveAccessibleDescription(/이미/)
  expect(saveProfile).not.toHaveBeenCalled()
  change('서버 이름', '시험')
  change('호스트', '2001:db8::1')
  change('포트', '65535')
  click('저장하고 연결')
  expect(saveProfile).toHaveBeenCalledExactlyOnceWith({id:expect.any(String), name:'시험', host:'2001:db8::1', port:65535}, true)
})

it('saves the chosen file reference only for the imported endpoint', async () => {
  const ssh = {pickStartup:vi.fn().mockResolvedValue(draft), discardStartup:vi.fn().mockResolvedValue(undefined)}
  vi.stubGlobal('termRailSsh', ssh)
  const form = editorDialog()
  click('시작 파일 가져오기')
  expect(await screen.findByText(draft.name)).toBeVisible()
  expect(ssh.pickStartup).toHaveBeenCalledExactlyOnceWith({host:'dev.example', port:22})
  change('호스트', 'other.example')
  expect(screen.queryByText(draft.name)).toBeNull()
  click('저장')
  expect(form.saveProfile).toHaveBeenCalledExactlyOnceWith({id:'dev',name:'개발', host:'other.example',port:22}, false)
  form.unmount()
  expect(ssh.discardStartup).toHaveBeenCalledExactlyOnceWith(draft.id)
})

it('keeps the imported reference after a successful save', async () => {
  const ssh = {pickStartup:vi.fn().mockResolvedValue(draft), discardStartup:vi.fn().mockResolvedValue(undefined)}
  vi.stubGlobal('termRailSsh', ssh)
  const form = editorDialog()
  click('시작 파일 가져오기')
  expect(await screen.findByText(draft.name)).toBeVisible()
  click('저장')
  expect(form.saveProfile).toHaveBeenCalledExactlyOnceWith({...profile, startup:draft}, false)
  form.unmount()
  expect(ssh.discardStartup).not.toHaveBeenCalled()
})

it('discards a native import that finishes after leaving the dialog', async () => {
  let complete!: (value: typeof draft) => void
  const deferred = new Promise<typeof draft>(resolve => {complete = resolve})
  const ssh = {pickStartup:vi.fn().mockReturnValue(deferred), discardStartup:vi.fn().mockResolvedValue(undefined)}
  vi.stubGlobal('termRailSsh', ssh)
  const form = editorDialog()
  click('시작 파일 가져오기')
  form.unmount()
  await act(async () => complete(draft))
  expect(ssh.discardStartup).toHaveBeenCalledExactlyOnceWith(draft.id)
})

it('retains the original file on cancel and discards only unsaved imports after a failed save', async () => {
  const replacement = {id:'replacement', name:'replacement.sh'}
  const ssh = {pickStartup:vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce(replacement),
    discardStartup:vi.fn().mockResolvedValue(undefined)}
  vi.stubGlobal('termRailSsh', ssh)
  const form = editorDialog()
  click('시작 파일 가져오기')
  expect(await screen.findByText(draft.name)).toBeVisible()
  click('시작 파일 가져오기')
  expect(await screen.findByText(replacement.name)).toBeVisible()
  expect(ssh.discardStartup).toHaveBeenCalledExactlyOnceWith(draft.id)
  form.saveProfile.mockImplementationOnce(() => {throw Error('저장 실패')})
  click('저장')
  expect(screen.getByRole('alert')).toHaveTextContent('저장 실패')
  expect(screen.getByText(replacement.name)).toBeVisible()
  expect(form.close).not.toHaveBeenCalled()
  click('취소')
  form.unmount()
  expect(ssh.discardStartup.mock.calls).toEqual([[draft.id], [replacement.id]])
})
