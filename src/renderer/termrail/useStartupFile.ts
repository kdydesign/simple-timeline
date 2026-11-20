import {useLayoutEffect, useRef, useState} from 'react'
import type {TermRailEndpoint, TermRailStartupRef} from '../../shared/termrail-ssh'
import type {Profile} from './layout'

export function useStartupFile(source: Profile | undefined, endpoint: TermRailEndpoint, report: (message: string) => void) {
  // The native picker returns only a display name. A usable reference exists after binding.
  const [selection, select] = useState<TermRailStartupRef | string | undefined>(source?.startup)
  const [busy, setBusy] = useState(false)
  const [pickError, setPickError] = useState('')
  const owner = useRef<string | undefined>(undefined)
  const endpointChanged = typeof selection === 'object' && (source?.host !== endpoint.host || source.port !== endpoint.port)
  const saved = typeof selection === 'object' && !endpointChanged ? selection : undefined
  const name = typeof selection === 'string' ? selection : saved?.name

  function finishDraft(savedId?: string) {
    if (!owner.current) return
    void window.termRailSsh.finishStartup(owner.current, savedId).catch(() => report('가져온 시작 파일을 정리할 수 없습니다.'))
    owner.current = undefined
  }
  useLayoutEffect(() => () => finishDraft(), [])

  async function pick() {
    const editorId = owner.current ??= crypto.randomUUID()
    setBusy(true)
    setPickError('')
    try {
      const imported = await window.termRailSsh.pickStartup(editorId)
      if (imported && owner.current === editorId) select(imported)
    } catch {
      if (owner.current === editorId) setPickError('시작 파일을 가져올 수 없습니다. 파일 형식과 보안 저장소를 확인하세요.')
    } finally {
      if (owner.current === editorId) setBusy(false)
    }
  }

  async function bindAndSave(editorId: string, persist: (ref: TermRailStartupRef) => void, done: () => void) {
    setBusy(true)
    let bound: TermRailStartupRef | undefined
    try {
      bound = await window.termRailSsh.bindStartup(editorId, endpoint).catch(() => {
        throw Error('시작 파일을 보호하여 저장할 수 없습니다.')
      })
      if (owner.current !== editorId) return
      persist(bound)
      finishDraft(bound.id)
      bound = undefined
      done()
    } finally {
      if (bound) await window.termRailSsh.discardStartup(bound.id).catch(() => report('가져온 시작 파일을 정리할 수 없습니다.'))
      if (owner.current === editorId) setBusy(false)
    }
  }

  return {
    name, busy, pick, pickError, endpointChanged,
    remove() {finishDraft(); select(undefined); setPickError('')},
    save(persist: (ref: TermRailStartupRef | undefined) => void, done: () => void) {
      if (typeof selection === 'string' && owner.current) return bindAndSave(owner.current, persist, done)
      persist(saved)
      done()
    },
  }
}
