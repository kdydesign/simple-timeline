import { useEffect, useState } from 'react'
import { localDate } from '../state/dateNavigation'

export function useLocalWorkDate(initialDate?: Date) {
  const [date, setDate] = useState(() => localDate(initialDate ?? new Date()))
  useEffect(() => {
    if (initialDate) return
    let timer: number
    const check = () => {
      window.clearTimeout(timer)
      const now = new Date()
      setDate(localDate(now))
      const midnight = new Date(now)
      midnight.setHours(24, 0, 0, 0)
      timer = window.setTimeout(check, midnight.getTime() - now.getTime())
    }
    check()
    window.addEventListener('focus', check)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('focus', check)
    }
  }, [initialDate])
  return date
}
