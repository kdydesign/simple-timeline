import type { TermWindowBounds } from '../../shared/term-window'

export function openTermWindow(bounds?: TermWindowBounds): Window | null {
  const frameName = window.workrailTermWindow?.prepare(bounds)
  return frameName ? window.open('about:blank', frameName) : null
}
