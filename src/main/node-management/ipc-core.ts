import { isEnvironmentId, isRemovalConfirmation, isNodeVersion, type NodeManagementResult } from '../../shared/node-management'
import { nodeManagementError, type NodeManagementService } from './service'

export type NodeCommandService = Omit<NodeManagementService, 'verifiedManagerFolder'> & Partial<{
  openManagerFolder(expectedEnvironmentId: string): ReturnType<NodeManagementService['getState']>
  openManagerRelease(expectedEnvironmentId: string): ReturnType<NodeManagementService['getState']>
  selectEnvironment(id: string): ReturnType<NodeManagementService['getState']>
  startEnvironment(): ReturnType<NodeManagementService['getState']>
  cancelOperation(): ReturnType<NodeManagementService['getState']>
  windowsSelected(): boolean
}>

export async function dispatchNodeManagement(
  service: NodeCommandService,
  args: unknown[],
  trusted: boolean,
): Promise<NodeManagementResult> {
  if (!trusted) return { ok: false, error: nodeManagementError('forbidden') }
  const [command, version] = args
  try {
    if (args.length === 2 && (command === 'selectEnvironment' || command === 'openManagerFolder' || command === 'openManagerRelease') && isEnvironmentId(version) && service[command]) {
      return { ok: true, data: await service[command](version) }
    }
    if (args.length === 1 && (command === 'startEnvironment' || command === 'cancelOperation') && service[command]) {
      return { ok: true, data: await service[command]() }
    }
    if (args.length === 1 && (command === 'getState' || command === 'refreshCatalog' || command === 'installManager')) {
      return { ok: true, data: await service[command]() }
    }
    if (args.length === 2 && command === 'removeStandalone' && isRemovalConfirmation(version)) {
      return { ok: true, data: await service.removeStandalone(version) }
    }
    if (args.length === 2 && (command === 'install' || command === 'use') && isNodeVersion(version)) {
      return { ok: true, data: await service[command](version) }
    }
    return { ok: false, error: nodeManagementError('invalid-request') }
  } catch {
    return { ok: false, error: nodeManagementError('ipc-unavailable') }
  }
}
