import { useCallback, useEffect, useRef, useState } from 'react'
import type { NodeManagementApi, NodeManagementError, NodeManagementResult, NodeManagementState } from '../../shared/node-management'

export type NodeMutation = { kind: 'install' | 'use'; version: string } | { kind: 'install-manager'; version: null }
type RequestKind = 'read' | 'recheck' | 'mutation'

const unavailable: NodeManagementError = {
  code: 'ipc-unavailable',
  message: 'Node 관리 응답을 확인하지 못했습니다. 다시 검사해 주세요.',
}

interface Connection {
  revision: number
  request: number
  acceptedRequest: number
  mutation: NodeMutation | null
  catalogPending: boolean
}

export function useNodeManagement(active: boolean, api: NodeManagementApi | undefined = window.workrailNodeManagement) {
  const connection = useRef<Connection | null>(null)
  const [state, setState] = useState<NodeManagementState | null>(null)
  const [readError, setReadError] = useState<NodeManagementError | null>(() => api ? null : unavailable)
  const [mutationFailure, setMutationFailure] = useState<{ request: number; error: NodeManagementError } | null>(null)
  const [mutation, setMutation] = useState<NodeMutation | null>(null)
  const [catalogPending, setCatalogPending] = useState(false)

  const run = useCallback(async (command: () => Promise<NodeManagementResult>, kind: RequestKind = 'read') => {
    const current = connection.current
    if (!current) return
    const startRevision = current.revision
    const request = ++current.request
    let result: NodeManagementResult
    try {
      result = await command()
    } catch {
      result = { ok: false, error: unavailable }
    }
    if (connection.current !== current) return
    if (result.ok) {
      const { revision } = result.data
      if (revision < current.revision || (revision === current.revision && request < current.acceptedRequest)) return
      current.revision = revision
      current.acceptedRequest = request
      setState(result.data)
      setReadError(null)
      if (kind === 'recheck' && !result.data.busy && result.data.error?.code !== 'inspection-failed') {
        setMutationFailure(failure => failure && failure.request < request ? null : failure)
      }
    } else if (kind === 'mutation') {
      // An unrelated snapshot cannot confirm a command that never returned a state.
      setMutationFailure({ request, error: result.error })
    } else if (startRevision === current.revision && request === current.request) {
      setReadError(result.error)
    }
  }, [])

  const refresh = useCallback(() => {
    if (api && !connection.current?.mutation) return run(() => api.getState(), 'recheck')
  }, [api, run])
  const refreshCatalog = useCallback(async () => {
    const current = connection.current
    if (!api || !current || current.catalogPending || current.mutation) return
    current.catalogPending = true
    setCatalogPending(true)
    try {
      await run(() => api.refreshCatalog())
    } finally {
      if (connection.current === current) {
        current.catalogPending = false
        setCatalogPending(false)
      }
    }
  }, [api, run])

  useEffect(() => {
    setState(null)
    setReadError(api ? null : unavailable)
    setMutationFailure(null)
    setMutation(null)
    setCatalogPending(false)
    if (!api) return
    const current: Connection = { revision: -1, request: 0, acceptedRequest: 0, mutation: null, catalogPending: false }
    connection.current = current
    const off = api.onChange(next => {
      if (connection.current !== current || next.revision <= current.revision) return
      current.revision = next.revision
      setState(next)
      setReadError(null)
    })
    const inspect = () => { void run(() => api.getState()) }
    window.addEventListener('focus', inspect)
    inspect()
    return () => {
      connection.current = null
      off()
      window.removeEventListener('focus', inspect)
    }
  }, [api, run])

  const catalogRequested = useRef(false)
  const busy = !!mutation || !!state?.busy
  useEffect(() => {
    if (!active) catalogRequested.current = false
    if (!active || !state?.supported || catalogRequested.current || busy) return
    catalogRequested.current = true
    void refreshCatalog()
  }, [active, state?.supported, busy, refreshCatalog])

  async function mutate(operation: NodeMutation) {
    const current = connection.current
    if (!api || !current || !state?.supported || state.busy || current.mutation) return
    const command = operation.kind === 'install-manager' ? () => api.installManager()
      : operation.kind === 'install' ? () => api.install(operation.version)
      : () => api.use(operation.version)
    current.mutation = operation
    setMutation(operation)
    try {
      await run(command, 'mutation')
    } finally {
      if (connection.current === current) {
        current.mutation = null
        setMutation(null)
      }
    }
  }

  const error = mutationFailure?.error ?? readError
  return { state, error, available: !!api, mutation, busy, refresh, catalogPending, refreshCatalog, mutate }
}

export type NodeManagement = ReturnType<typeof useNodeManagement>
