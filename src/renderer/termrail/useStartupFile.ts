import {useLayoutEffect, useRef, useState} from 'react'
import type {TermRailEndpoint, TermRailStartupRef} from '../../shared/termrail-ssh'
import type {Profile} from './layout'

type Selection = {endpoint: TermRailEndpoint; file: TermRailStartupRef}
export function useStartupFile(source: Profile | undefined, endpoint: TermRailEndpoint, report: (message: string) => void) {
  const [selection, select] = useState<Selection | undefined>(() => source?.startup ? {endpoint: source, file: source.startup} : undefined)
  const [picking, setPicking] = useState(false)
  const [pickError, setPickError] = useState('')
  const pending = useRef<string | undefined>(undefined)
  const mounted = useRef(false)
  const file = selection?.endpoint.host === endpoint.host && selection.endpoint.port === endpoint.port ? selection.file : undefined

  function discard(id: string) {
    void window.termRailSsh.discardStartup(id).catch(() => report('가져온 시작 파일을 정리할 수 없습니다.'))
  }
  function clearPending() {
    if (pending.current) discard(pending.current)
    pending.current = undefined
  }
  useLayoutEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      clearPending()
    }
  }, [])

  async function pick() {
    setPicking(true)
    setPickError('')
    try {
      const imported = await window.termRailSsh.pickStartup(endpoint)
      if (!imported) return
      if (!mounted.current) {discard(imported.id); return}
      clearPending()
      pending.current = imported.id
      select({endpoint, file: imported})
    } catch {
      if (mounted.current) setPickError('시작 파일을 가져올 수 없습니다. 파일 형식과 보안 저장소를 확인하세요.')
    } finally {
      if (mounted.current) setPicking(false)
    }
  }

  return {
    file, picking, pick, pickError, endpointChanged: !!selection && !file,
    remove() {clearPending(); select(undefined); setPickError('')},
    saved() {if (pending.current === file?.id) pending.current = undefined},
  }
}
