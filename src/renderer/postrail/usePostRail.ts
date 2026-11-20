import type {PrDraftProblem, PrSendError} from '../../shared/postrail-console'
import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import type {PrLibrary, PrMutation, PrRequest} from '../../shared/postrail'
import type {PrRunState} from '../../shared/postrail-run'
import {postRailBusy} from '../../shared/postrail-run'

const emptyLibrary: PrLibrary = {groups:[], requests:[], environments:[], environmentId:null}

function displayError(error: unknown) {
  return error instanceof Error
    ? error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
    : 'PostRail 작업을 완료하지 못했습니다.'
}

export function usePostRail(enabled: boolean) {
  const api = window.postRail
  const [library, setLibrary] = useState(emptyLibrary)
  const [run, setRun] = useState<PrRunState|null>(null)
  const [error, setError] = useState('')
  const [unreported, setUnreported] = useState<PrSendError[]>([])
  const [canRememberPassword, setCanRememberPassword] = useState(false)
  const [ready, setReady] = useState(false)
  const [submittingRequestId, setSubmittingRequestId] = useState<string|null>(null)
  const submitting = submittingRequestId !== null
  const versions = useRef({library:0, run:0})
  const lastRun = useRef<PrRunState|null>(null)
  const starting = useRef(false)
  const clearError = useCallback(()=>setError(''), [])
  const report = useCallback((e:unknown)=>setError(displayError(e)), [])
  const readLibrary = useCallback(async()=>{
    if (!api) return
    const seq = ++versions.current.library
    const value = await api.read()
    if (seq === versions.current.library) {setLibrary(value); setReady(true)}
  },[api])
  const readRun = useCallback(async()=>{
    if (!api) return
    const seq = ++versions.current.run
    const value = await api.state()
    if (seq !== versions.current.run) return
    const previous = lastRun.current
    lastRun.current=value
    setRun(value)
    // Index reservations belong to saved requests; fetch their committed values at completion.
    if (value.runId && !postRailBusy(value.phase) &&
        (previous?.runId !== value.runId || previous.phase !== value.phase)) await readLibrary()
  },[api,readLibrary])
  const refresh = useCallback(async()=>{
    if (!api) return
    try {
      await Promise.all([readLibrary(), readRun(), api.capability().then(setCanRememberPassword)])
    } catch(e) { report(e) }
  },[api,readLibrary,readRun,report])
  useEffect(()=>{
    if (!enabled || !api) return
    const unsubscribe=api.onChange(kind=>{
      void (kind==='library' ? refresh() : readRun().catch(report))
    })
    void refresh()
    return unsubscribe
  },[enabled,api,refresh,readRun,report])
  const mutate = useCallback(async(command:PrMutation)=>{
    if (!api) return null
    clearError()
    try {
      const value=await api.mutate(command)
      ++versions.current.library
      setLibrary(value);setReady(true)
      return value
    } catch(e) {report(e);return null}
  },[api,clearError,report])
  const start = useCallback(async(request:PrRequest,environmentId:string,count:string)=>{
    if (!api||starting.current) return false
    const attemptId = crypto.randomUUID()
    const sameScope = (error:PrSendError) => error.requestId === request.id && error.environmentId === environmentId
    const clearFallback = () => setUnreported(previous => previous.some(sameScope) ? previous.filter(error => !sameScope(error)) : previous)
    starting.current=true;setSubmittingRequestId(request.id);clearError()
    try {
      const started=await api.start({request,environmentId,count,attemptId})
      if (!started) return false
      clearFallback()
      await readRun().catch(report)
      return true
    } catch {
      try {
        // Main keeps the first diagnosis for this attempt. A rejected IPC call may
        // never have reached the runner, in which case it adds one safe entry now.
        await api.invalidDraft(request.id, environmentId, 'dispatch', request.method, '', attemptId)
        await readRun()
        clearFallback()
      } catch {
        setUnreported(previous => [...previous.filter(error => !sameScope(error)), {
          requestId:request.id, environmentId, preflight:false, message:'PostRail에서 전송 요청의 처리 여부를 확인할 수 없습니다.',
        }])
      }
      return false
    } finally {starting.current=false;setSubmittingRequestId(null)}
  },[api,readRun,clearError,report])
  const stop = useCallback(async()=>{
    if (!api) return
    try {await api.stop();await readRun()} catch(e) {report(e)}
  },[api,readRun,report])
  const logout = useCallback(async(id:string)=>{
    if (!api) return false
    try {await api.logout(id);await readRun();return true} catch(e) {report(e);return false}
  },[api,readRun,report])
  const sendError = useCallback((requestId:string, environmentId:string|null) => {
    const matches = (error:PrSendError) => error.requestId === requestId && error.environmentId === (environmentId ?? '')
    return unreported.find(matches) ?? run?.sendErrors?.find(matches)
  }, [run?.sendErrors,unreported])
  const consoleSince = useCallback(async (after:number) => api ? api.consoleSince(after) : [], [api])
  const invalidDraft = useCallback(async (request: PrRequest, environmentId: string|null, category: PrDraftProblem, diagnosis = '') => {
    if (!api) return
    try {
      await api.invalidDraft(request.id, environmentId ?? '', category, request.method, diagnosis)
      await readRun()
    } catch(e) { report(e) }
  }, [api,readRun,report])
  const page = useCallback(async(offset:string,runId=lastRun.current?.runId)=>{
    if (!api||!runId) return []
    try {return await api.page(offset,runId)} catch(e) {report(e);return []}
  },[api,report])
  const detail = useCallback(async(iteration:string,runId=lastRun.current?.runId)=>{
    if (!api||!runId) return null
    try {return await api.detail(iteration,runId)} catch(e) {report(e);return null}
  },[api,report])
  return useMemo(()=>({library,run,error,available:!!api && ready,submitting,submittingRequestId,sendError,consoleSince,invalidDraft,canRememberPassword,
    refresh,mutate,start,stop,logout,page,detail,clearError}),
    [library,run,error,api,ready,submitting,submittingRequestId,sendError,consoleSince,invalidDraft,canRememberPassword,refresh,mutate,start,stop,logout,page,detail,clearError])
}
export type PostRailController=ReturnType<typeof usePostRail>
