import { useState, useLayoutEffect } from 'react'
const KEY = 'simple-timeline.preferences.v1'
interface Preferences { theme: 'light' | 'dark'; collapsed: string[] }
function read(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return { theme: value?.theme === 'dark' ? 'dark' : 'light',
      collapsed: Array.isArray(value?.collapsed) ? value.collapsed.filter((id: unknown) => typeof id === 'string') : [] }
  } catch { return { theme: 'light', collapsed: [] } }
}
export function usePreferences() {
  const [value, setValue] = useState(read)
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = value.theme
    try { localStorage.setItem(KEY, JSON.stringify(value)) } catch { /* Read-only storage must not block schedule editing. */ }
  }, [value])
  return { ...value,
    toggleTheme: () => setValue(v => ({...v, theme:v.theme === 'light' ? 'dark' : 'light'})),
    toggleProject: (id: string) => setValue(v => ({...v, collapsed: v.collapsed.includes(id) ? v.collapsed.filter(x => x !== id) : [...v.collapsed, id]})),
  }
}
