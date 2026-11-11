import { useState, useLayoutEffect } from 'react'
import {validDayWidth} from '../../visualization/ganttNavigation'
const KEY = 'simple-timeline.preferences.v1'
interface Preferences { theme: 'dark'; collapsed: string[]; dayWidth:number }
function read(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return { dayWidth:validDayWidth(value?.dayWidth), theme: 'dark',
      collapsed: Array.isArray(value?.collapsed) ? value.collapsed.filter((id: unknown) => typeof id === 'string') : [] }
  } catch { return { dayWidth:28, theme:'dark', collapsed:[] } }
}
export function usePreferences() {
  const [value, setValue] = useState(read)
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = value.theme
    try { localStorage.setItem(KEY, JSON.stringify(value)) } catch { /* Read-only storage must not block schedule editing. */ }
  }, [value])
  return { ...value,
    setDayWidth: (width:number) => setValue(v => ({...v,dayWidth:validDayWidth(width)})),
    toggleProject: (id: string) => setValue(v => ({...v, collapsed: v.collapsed.includes(id) ? v.collapsed.filter(x => x !== id) : [...v.collapsed, id]})),
  }
}
