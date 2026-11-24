import { Dialog } from 'radix-ui'
import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { deviceError } from './useDeviceRail'

export function DeviceDialog({ title, children, confirm, danger, onSubmit, onClose }: {
  title: string
  children: ReactNode
  confirm: string
  danger?: boolean
  onSubmit: () => Promise<void>
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const [opener] = useState(() => document.activeElement)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      await onSubmit()
      onClose()
    } catch (cause) {
      setError(deviceError(cause))
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  return <Dialog.Root open onOpenChange={open => { if (!open && !pending.current) onClose() }}>
    <Dialog.Portal>
      <Dialog.Overlay className="workrail-dialog-overlay" />
      <Dialog.Content className="workrail-dialog device-dialog" aria-describedby={undefined}
        onCloseAutoFocus={event => {
          event.preventDefault()
          if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
        }}>
        <Dialog.Title>{title}</Dialog.Title>
        <form onSubmit={submit}>
          <fieldset disabled={busy}>{children}</fieldset>
          {error && <p role="alert" className="device-error">{error}</p>}
          <div className="device-dialog-actions">
            <Dialog.Close type="button" className="workrail-control" disabled={busy}>취소</Dialog.Close>
            <button type="submit" disabled={busy} className={'workrail-control ' + (danger ? 'device-danger' : 'workrail-primary')}>
              {busy ? '처리 중…' : confirm}
            </button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
