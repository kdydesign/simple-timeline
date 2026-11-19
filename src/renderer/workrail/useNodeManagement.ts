import { useCallback, useEffect, useRef, useState } from 'react'
import type { NodeManagementApi, NodeManagementError, NodeManagementResult, NodeManagementState } from '../../shared/node-management'

export type NodeMutation = { kind: 'install' | 'use'; version: string } | { kind: 'install-manager'; version: null } | {kind:'remove-standalone';version:null;confirmationId:string}
type RequestKind = 'read' | 'recheck' | 'mutation' | 'maintenance' | 'control'
type EnvironmentRequest = 'select' | 'start'

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
  snapshot: NodeManagementState | null
  request: number
  acceptedRequest: number
  mutation: NodeMutation | null
  catalogPending: boolean
  openingMaintenance: boolean
  environmentPending: EnvironmentRequest | null
  cancelPending: boolean
}

function isOperationUnknown(state: NodeManagementState | null) {
  return state?.error?.code === 'operation-unknown'
}

function workLocked(state: NodeManagementState | null) {
  return !!state?.busy || !!state?.maintenance?.active || isOperationUnknown(state)
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
  const [environmentPending, setEnvironmentPending] = useState<EnvironmentRequest | null>(null)
  const [cancelPending, setCancelPending] = useState(false)
  const [controlError, setControlError] = useState<NodeManagementError | null>(null)

  const run = useCallback(async (command: () => Promise<NodeManagementResult>, kind: RequestKind = 'read') => {
    const current = connection.current
    if (!current) return
    const startRevision = current.snapshot?.revision ?? -1
    const request = ++current.request
    let result: NodeManagementResult
    try {
      result = await command()
    } catch {
      result = { ok: false, error: unavailable }
    }
    if (connection.current !== current) return
    const currentRevision = current.snapshot?.revision ?? -1
    if (result.ok) {
      const { revision, error } = result.data
      if (revision < currentRevision || (revision === currentRevision && request < current.acceptedRequest)) return
      const confirmedError = current.snapshot?.error
      // A denied change can echo the current snapshot with a command-local error.
      if ((kind === 'control' || kind === 'mutation') && revision === currentRevision && error
        && (error.code !== confirmedError?.code || error.message !== confirmedError.message)) {
        setControlError(error)
        return { ok: false as const, error }
      }
      current.snapshot = result.data
      current.acceptedRequest = request
      setState(result.data)
      setReadError(null)
    } else if (kind === 'maintenance') {
      setMaintenanceError(result.error.message)
    } else if (kind === 'mutation' && result.error.code === 'ipc-unavailable') {
      // An unrelated snapshot cannot confirm a command that never returned a state.
      setMutationFailure({ request, error: result.error })
    } else if (kind === 'control' || kind === 'mutation') {
      setControlError(result.error)
    } else if (startRevision === currentRevision && request === current.request) {
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
    return result
  }, [])

  const refresh = useCallback(() => {
    const current = connection.current
    if (api && current && !current.mutation && !current.environmentPending) {
      setControlError(null)
      return run(() => api.getState(), 'recheck')
    }
  }, [api, run])
  const refreshCatalog = useCallback(async () => {
    const current = connection.current
    if (!api || !current || current.catalogPending || current.mutation || current.environmentPending) return
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
    setEnvironmentPending(null)
    setCancelPending(false)
    setControlError(null)
    if (!api) return
    const current: Connection = { snapshot: null, request: 0, acceptedRequest: 0, mutation: null, catalogPending: false,
      openingMaintenance: false, environmentPending: null, cancelPending: false }
    connection.current = current
    const off = api.onChange(next => {
      if (connection.current !== current || next.revision <= (current.snapshot?.revision ?? -1)) return
      current.snapshot = next
      setState(next)
      setReadError(null)
    })
    const inspect = () => {
      if (!current.environmentPending) void run(() => api.getState())
    }
    window.addEventListener('focus', inspect)
    inspect()
    return () => {
      connection.current = null
      off()
      window.removeEventListener('focus', inspect)
    }
  }, [api, run])

  const catalogRequested = useRef<string | null>(null)
  const busy = openingMaintenance || !!environmentPending || cancelPending || !!mutation || workLocked(state)
  const environment = state?.environments?.items.find(item => item.id === state.environments?.selectedId)
  const catalogTarget = !state?.supported ? null : !state.environments ? 'windows'
    : state.environments.status === 'ready' && environment?.running ? environment.id : null
  useEffect(() => {
    if (!active || !catalogTarget) {
      catalogRequested.current = null
      return
    }
    if (catalogRequested.current === catalogTarget || busy || catalogPending) return
    catalogRequested.current = catalogTarget
    void refreshCatalog()
  }, [active, catalogTarget, busy, catalogPending, refreshCatalog])

  async function mutate(operation: NodeMutation) {
    const current = connection.current
    if (!api || !current || !state?.supported || busy || workLocked(current.snapshot)
      || current.mutation || current.environmentPending || current.openingMaintenance) return
    const command = operation.kind === 'remove-standalone' ? () => api.removeStandalone({confirmed:true,confirmationId:operation.confirmationId})
      : operation.kind === 'install-manager' ? () => api.installManager()
      : operation.kind === 'install' ? () => api.install(operation.version)
      : () => api.use(operation.version)
    current.mutation = operation
    setControlError(null)
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

  async function changeEnvironment(request: { kind: 'select'; id: string } | { kind: 'start' }) {
    const current = connection.current
    if (!api || !current || busy || workLocked(current.snapshot) || current.mutation || current.environmentPending
      || current.openingMaintenance || current.catalogPending) return false
    if (state?.environments?.status !== 'ready') return false
    current.environmentPending = request.kind
    setEnvironmentPending(request.kind)
    setControlError(null)
    try {
      const result = await run(() => request.kind === 'start' ? api.startEnvironment() : api.selectEnvironment(request.id), 'control')
      if (request.kind === 'select' && result?.ok && result.data.environments?.selectedId === request.id) {
        setMutationFailure(null)
        return true
      }
      return false
    } finally {
      if (connection.current === current) {
        current.environmentPending = null
        setEnvironmentPending(null)
      }
    }
  }

  async function cancelOperation() {
    const current = connection.current
    if (!api || !current || current.cancelPending || !state?.busy?.cancellable) return
    current.cancelPending = true
    setCancelPending(true)
    setControlError(null)
    try {
      await run(() => api.cancelOperation(), 'control')
    } finally {
      if (connection.current === current) {
        current.cancelPending = false
        setCancelPending(false)
      }
    }
  }

  async function openMaintenance() {
    const current = connection.current
    if (!api || !current || current.openingMaintenance || current.environmentPending || current.mutation) return
    if (isOperationUnknown(current.snapshot) && !current.snapshot?.maintenance?.active) return
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
  return { state, error, controlError, openingMaintenance, maintenanceError, recoveryError: mutationFailure?.recoveryError,
    available: !!api, mutation, busy, refresh, catalogPending, refreshCatalog, mutate, openMaintenance,
    environment, environmentPending, changeEnvironment, cancelPending, cancelOperation }
}

export type NodeManagement = ReturnType<typeof useNodeManagement>
