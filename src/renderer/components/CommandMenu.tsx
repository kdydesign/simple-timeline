import {useLayoutEffect, useRef} from 'react'
import './command-menu.css'

export type CommandMenuState = {anchor: HTMLElement; x: number; y: number; label?: string; items: [string, () => void][]}
export function CommandMenu({menu, dismiss}: {menu: CommandMenuState; dismiss: () => void}) {
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
  return <div className="workrail-command-menu" role="menu" aria-label={menu.label ?? '작업 메뉴'} ref={ref}
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
    {menu.label && <span className="workrail-command-menu-heading">{menu.label}</span>}
    {menu.items.map(([label, action], index) => <button key={index} role="menuitem" type="button" onClick={() => {dismiss(); action()}}>{label}</button>)}
  </div>
}
