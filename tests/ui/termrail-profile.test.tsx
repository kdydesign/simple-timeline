import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, expect, it, vi} from 'vitest'
import {WorkspaceDialog, type Editor} from '../../src/renderer/termrail/WorkspaceControls'

HTMLDialogElement.prototype.showModal ??= function () { this.open = true }
HTMLDialogElement.prototype.close ??= function () { this.open = false }
afterEach(() => {cleanup(); vi.unstubAllGlobals()})

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
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(finish => {resolve = finish})
  return {promise, resolve}
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

function bridge() {
  const ssh = {pickStartup: vi.fn().mockResolvedValue(draft.name), bindStartup: vi.fn().mockResolvedValue(draft),
    finishStartup: vi.fn().mockResolvedValue(undefined), discardStartup: vi.fn().mockResolvedValue(undefined)}
  vi.stubGlobal('termRailSsh', ssh)
  return ssh
}

it('tabs to import on a blank server, keeps the file on validation failure, and binds to the final endpoint', async () => {
  const user = userEvent.setup()
  const ssh = bridge()
  const form = editorDialog({kind:'add', anchor})
  screen.getByLabelText('서버 이름').focus()
  await user.tab()
  await user.tab()
  await user.tab()
  expect(screen.getByRole('button', {name:'시작 파일 가져오기'})).toHaveFocus()
  expect(screen.queryByRole('alert')).toBeNull()
  await user.keyboard('{Enter}')
  expect(await screen.findByText(draft.name)).toBeVisible()
  expect(ssh.bindStartup).not.toHaveBeenCalled()
  const owner = ssh.pickStartup.mock.calls[0][0]
  expect(typeof owner).toBe('string')
  await user.click(screen.getByRole('button', {name:'저장'}))
  expect(screen.getByLabelText('서버 이름')).toHaveFocus()
  expect(screen.getByLabelText('호스트')).toHaveAccessibleDescription(/입력/)
  expect(screen.getByText(draft.name)).toBeVisible()
  expect(ssh.bindStartup).not.toHaveBeenCalled()
  change('서버 이름', '새 서버')
  change('호스트', 'dev.test')
  change('포트', '2200')
  await user.click(screen.getByRole('button', {name:'저장'}))
  expect(ssh.bindStartup).toHaveBeenCalledExactlyOnceWith(owner, {host:'dev.test', port:2200})
  expect(form.saveProfile).toHaveBeenCalledExactlyOnceWith({id:expect.any(String),name:'새 서버',host:'dev.test',port:2200,startup:draft}, false)
  expect(ssh.finishStartup).toHaveBeenCalledExactlyOnceWith(owner, draft.id)
  expect(ssh.discardStartup).not.toHaveBeenCalled()
})

it.each([['호스트', 'other.example'], ['포트','2222']])('requires a fresh choice to use an existing file after editing %s', (field, value) => {
  const ssh = bridge()
  const form = editorDialog()
  change(field, value)
  expect(screen.queryByText(profile.startup.name)).toBeNull()
  expect(screen.getByRole('status')).toHaveTextContent('다시 가져오세요')
  click('저장')
  expect(form.saveProfile.mock.calls[0][0].startup).toBeUndefined()
  expect(ssh.bindStartup).not.toHaveBeenCalled()
})

it('revokes the editor while its picker is open', async () => {
  const pending = deferred<string>()
  const ssh = bridge()
  ssh.pickStartup.mockReturnValueOnce(pending.promise)
  const form = editorDialog()
  click('시작 파일 가져오기')
  form.unmount()
  expect(ssh.finishStartup).toHaveBeenCalledExactlyOnceWith(ssh.pickStartup.mock.calls[0][0], undefined)
  await act(async () => pending.resolve(draft.name))
  expect(ssh.bindStartup).not.toHaveBeenCalled()
})

it('shows an import error immediately and keeps the existing selection available', async () => {
  const ssh = bridge()
  ssh.pickStartup.mockRejectedValueOnce(Error('unavailable'))
  editorDialog()
  click('시작 파일 가져오기')
  expect(await screen.findByRole('alert')).toHaveTextContent('파일 형식')
  expect(screen.getByText(profile.startup.name)).toBeVisible()
})

it('rolls back the new binding on storage failure, preserving the draft and saved file for retry', async () => {
  const ssh = bridge()
  const form = editorDialog()
  click('시작 파일 가져오기')
  expect(await screen.findByText(draft.name)).toBeVisible()
  form.saveProfile.mockImplementationOnce(() => {throw Error('저장 실패')})
  click('저장')
  expect(await screen.findByRole('alert')).toHaveTextContent('저장 실패')
  expect(ssh.discardStartup).toHaveBeenCalledExactlyOnceWith(draft.id)
  expect(screen.getByText(draft.name)).toBeVisible()
  expect(form.close).not.toHaveBeenCalled()
  const retry = {...draft, id:'retry'}
  ssh.bindStartup.mockResolvedValueOnce(retry)
  click('저장')
  await waitFor(() => expect(form.close).toHaveBeenCalledOnce())
  expect(form.saveProfile).toHaveBeenLastCalledWith({...profile, startup:retry}, false)
  expect(ssh.discardStartup).not.toHaveBeenCalledWith(retry.id)
})

it('does not persist or connect if the dialog is unmounted while binding', async () => {
  const ssh = bridge()
  const binding = deferred<typeof draft>()
  ssh.bindStartup.mockReturnValueOnce(binding.promise)
  const form = editorDialog({kind:'connect', anchor})
  change('서버 이름', '새 서버')
  change('호스트', 'other.test')
  click('시작 파일 가져오기')
  expect(await screen.findByText(draft.name)).toBeVisible()
  click('저장하고 연결')
  form.unmount()
  await act(async () => binding.resolve(draft))
  expect(form.saveProfile).not.toHaveBeenCalled()
  expect(ssh.discardStartup).toHaveBeenCalledExactlyOnceWith(draft.id)
})
