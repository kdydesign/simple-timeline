import { useCallback, useEffect, useRef, useState } from 'react'
import type { NodeManagementApi, NodeManagementError, NodeManagementResult, NodeManagementState } from '../../shared/node-management'

export type NodeMutation = { kind: 'install' | 'use'; version: string } | { kind: 'install-manager'; version: null } | {kind:'remove-standalone';version:null;confirmationId:string}
type RequestKind = 'read' | 'recheck' | 'mutation' | 'maintenance'

const unavailable: NodeManagementError = {
  code: 'ipc-unavailable',
  message: 'Node 관리 응답을 확인하지 못했습니다. 다시 검사해 주세요.',
}

interface MutationFailure {
  request: number
  error: NodeManagementError
  recoveryError?: NodeManagementError
}

interface Connection {
  revision: number
  request: number
  acceptedRequest: number
  mutation: NodeMutation | null
  catalogPending: boolean
  openingMaintenance: boolean
}

export function useNodeManagement(active: boolean, api: NodeManagementApi | undefined = window.workrailNodeManagement) {
  const connection = useRef<Connection | null>(null)
  const [state, setState] = useState<NodeManagementState | null>(null)
  const [readError, setReadError] = useState<NodeManagementError | null>(() => api ? null : unavailable)
  const [mutationFailure, setMutationFailure] = useState<MutationFailure | null>(null)
  const [openingMaintenance, setOpeningMaintenance] = useState(false)
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null)
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
    } else if (kind === 'maintenance') {
      setMaintenanceError(result.error.message)
    } else if (kind === 'mutation') {
      // An unrelated snapshot cannot confirm a command that never returned a state.
      setMutationFailure({ request, error: result.error })
    } else if (startRevision === current.revision && request === current.request) {
      setReadError(result.error)
    } else {
      return
    }
    // Only an explicit, completed inspection can resolve an unconfirmed change.
    // Keep its last failed recovery visible across focus and catalog snapshots.
    if (kind === 'recheck' && (!result.ok || !result.data.busy)) {
      const recoveryError = result.ok ? result.data.error : result.error
      const recovered = result.ok && recoveryError?.code !== 'inspection-failed'
      setMutationFailure(failure => {
        if (!failure || failure.request >= request) return failure
        return recovered ? null : { ...failure, recoveryError: recoveryError ?? undefined }
      })
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
    setOpeningMaintenance(false)
    setMaintenanceError(null)
    setCatalogPending(false)
    if (!api) return
    const current: Connection = { revision: -1, request: 0, acceptedRequest: 0, mutation: null, catalogPending: false, openingMaintenance: false }
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
  const busy = openingMaintenance || !!mutation || !!state?.busy || !!state?.maintenance?.active
  useEffect(() => {
    if (!active) catalogRequested.current = false
    if (!active || !state?.supported || catalogRequested.current || busy) return
    catalogRequested.current = true
    void refreshCatalog()
  }, [active, state?.supported, busy, refreshCatalog])

  async function mutate(operation: NodeMutation) {
    const current = connection.current
    if (!api || !current || !state?.supported || state.busy || current.mutation) return
    const command = operation.kind === 'remove-standalone' ? () => api.removeStandalone({confirmed:true,confirmationId:operation.confirmationId})
      : operation.kind === 'install-manager' ? () => api.installManager()
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

  async function openMaintenance() {
    const current = connection.current
    if (!api || !current || current.openingMaintenance) return
    current.openingMaintenance = true
    setOpeningMaintenance(true)
    setMaintenanceError(null)
    try {
      await run(() => api.openMaintenance(), 'maintenance')
    } finally {
      if (connection.current === current) {
        current.openingMaintenance = false
        setOpeningMaintenance(false)
      }
    }
  }
  const error = mutationFailure?.error ?? readError
  return { state, error, openingMaintenance, maintenanceError, recoveryError: mutationFailure?.recoveryError, available: !!api, mutation, busy, refresh, catalogPending, refreshCatalog, mutate, openMaintenance }
}

export type NodeManagement = ReturnType<typeof useNodeManagement>
