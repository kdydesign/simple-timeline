import { isRemovalConfirmation, isNodeVersion, type NodeManagementResult } from '../../shared/node-management'
import { nodeManagementError, type NodeManagementService } from './service'

export async function dispatchNodeManagement(
  service: NodeManagementService,
  args: unknown[],
  trusted: boolean,
): Promise<NodeManagementResult> {
  if (!trusted) return { ok: false, error: nodeManagementError('forbidden') }
  const [command, version] = args
  try {
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
