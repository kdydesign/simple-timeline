import { useState, useEffect, useRef, useCallback } from 'react'
import type { TimelineApi, MutationName } from '../../shared/api'
import type { TimelineSnapshot, ApiError, Result } from '../../shared/types'
export type TimelinePhase =
  | 'loading'
  | 'ready'
  | 'saving'
  | 'stale'
  | 'uncertain'
  | 'blocked'
const transport: ApiError = {
  code: 'IPC_UNAVAILABLE',
  message: '저장 결과를 확인할 수 없습니다. 먼저 다시 조회해 주세요.',
}
export function useTimeline(api: TimelineApi) {
  const [snapshot, setSnapshot] = useState<TimelineSnapshot | null>(null),
    [phase, setPhase] = useState<TimelinePhase>('loading'),
    [error, setError] = useState<ApiError | null>(null),
    [mutation, setMutation] = useState<'idle'|'pending'|'confirmed'|'failed'>('idle')
  const phaseRef = useRef<TimelinePhase>('loading'),
    alive = useRef(true),
    generation = useRef(0)
  const change = useCallback((next: TimelinePhase) => {
    phaseRef.current = next
    if (alive.current) setPhase(next)
  }, [])
  const read = useCallback(
    async (committed = false) => {
      const seq = ++generation.current
      try {
        const status = await api.getStatus()
        if (!alive.current || seq !== generation.current) return false
        if (!status.ok) throw status.error
        if (status.data.state === 'blocked') {
          setError({
            code: status.data.errorCode ?? 'DB_NOT_READY',
            message:
              (committed ? '저장은 완료했지만 새로고침에 실패했습니다. ' : '') + '저장소를 사용할 수 없습니다. 원본을 보존하고 종료 후 다시 실행해 주세요.',
          })
          change('blocked')
          return false
        }
        const result = await api.getSnapshot()
        if (!alive.current || seq !== generation.current) return false
        if (!result.ok) throw result.error
        setSnapshot(result.data)
        setError(null)
        change('ready')
        return true
      } catch (e) {
        if (!alive.current || seq !== generation.current) return false
        const failure =
          e && typeof e === 'object' && 'code' in e
            ? (e as ApiError)
            : transport
        setError(
          committed
            ? {
                ...failure,
                message: `저장은 완료했지만 새로고침에 실패했습니다. ${failure.message}`,
              }
            : failure,
        )
        change(
          ['DB_CORRUPT', 'SCHEMA_TOO_NEW', 'DB_NOT_READY'].includes(
            failure.code,
          )
            ? 'blocked'
            : 'stale',
        )
        return false
      }
    },
    [api, change],
  )
  const refresh = useCallback(async () => {
    if (phaseRef.current === 'saving') return
    change('loading')
    await read()
  }, [read, change])
  useEffect(() => {
    alive.current = true
    void refresh()
    return () => {
      alive.current = false
      generation.current++
    }
  }, [refresh])
  async function mutateExternal<T>(operation:()=>Promise<Result<T>>):Promise<Result<T>> {
    if (phaseRef.current !== 'ready')
      return {
        ok: false,
        error: { code: 'DB_NOT_READY', message: '먼저 조회를 완료해 주세요.' },
      }
    generation.current++
    change('saving')
    setMutation('pending')
    setError(null)
    let result: Result<T>
    try {
      result = await operation()
    } catch {
      result = { ok: false, error: transport }
    }
    if (!alive.current) return result
    if (result.ok) {
      setMutation('confirmed')
      await read(true)
    } else {
      setMutation('failed')
      setError(result.error)
      change(
        result.error.code === 'IPC_UNAVAILABLE'
          ? 'uncertain'
          : ['DB_CORRUPT', 'SCHEMA_TOO_NEW', 'DB_NOT_READY'].includes(
                result.error.code,
              )
            ? 'blocked'
            : 'ready',
      )
    }
    return result
  }
  function mutate<K extends MutationName>(method:K,input:Parameters<TimelineApi[K]>[0]):Promise<Awaited<ReturnType<TimelineApi[K]>>> {
    const operation=api[method] as (input:unknown)=>Promise<Result<unknown>>
    return mutateExternal(()=>operation(input)) as Promise<Awaited<ReturnType<TimelineApi[K]>>>
  }
  const reconcileSnapshot = useCallback(async (): Promise<TimelineSnapshot | null> => {
    if (phaseRef.current !== 'ready') return null
    const seq = ++generation.current
    try {
      const result = await api.getSnapshot()
      if (!alive.current || seq !== generation.current || phaseRef.current !== 'ready' || !result.ok) return null
      setSnapshot(result.data)
      return result.data
    } catch { return null }
  }, [api])
  const reconcile = useCallback(async () => await reconcileSnapshot() !== null, [reconcileSnapshot])
  return { snapshot, phase, error, mutation, refresh, mutate, mutateExternal, reconcile, reconcileSnapshot }
}
