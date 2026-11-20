import {useLayoutEffect, useRef, type ReactNode} from 'react'
import {createPortal} from 'react-dom'
import {IconButton} from '../components/Icon'
import './library.css'

export function PostRailPopup({title, anchor, onClose, children, busy = false}: {
  title: string
  anchor: HTMLElement
  onClose: () => void
  children: ReactNode
  busy?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    const place = () => {
      const bounds = anchor.getBoundingClientRect()
      dialog.style.left = Math.max(8, Math.min(bounds.left, innerWidth - dialog.offsetWidth - 8)) + 'px'
      dialog.style.top = Math.max(56, Math.min(bounds.bottom + 8, innerHeight - dialog.offsetHeight - 8)) + 'px'
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(dialog)
    window.addEventListener('resize', place)
    const first = dialog.querySelector<HTMLElement>('[data-initial-focus]') ?? dialog.querySelector<HTMLElement>('input')
    first?.focus()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', place)
      dialog.close()
      if (anchor.isConnected) anchor.focus()
    }
  }, [anchor])
  return createPortal(<dialog ref={ref} className="quick-reminder-popup postrail-popup" aria-label={title}
    onCancel={event => {event.preventDefault(); if (!busy) onClose()}}
    onKeyDown={event => {
      if (event.key === 'Escape') {event.preventDefault(); event.stopPropagation(); if (!busy) onClose()}
    }}
    onPointerDown={event => {
      if (busy || event.target !== event.currentTarget) return
      const box = event.currentTarget.getBoundingClientRect()
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose()
    }}>
    <div className="quick-reminder-heading"><h2>{title}</h2>
      <IconButton icon="close" label={title + ' 닫기'} disabled={busy} onClick={onClose}/>
    </div>
    {children}
  </dialog>, document.body)
}
