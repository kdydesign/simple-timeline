import type {DeviceHealth, RailDevice} from '../../shared/device-rail'

export const probeAxes = ['ssh', 'service'] as const

export function sameProbeTarget(left: RailDevice, right: RailDevice, axis: keyof DeviceHealth): boolean {
  if (axis === 'ssh') return left.host === right.host && left.port === right.port
  const a = left.service, b = right.service
  switch (a.kind) {
    case 'none': return b.kind === 'none'
    case 'http': return b.kind === 'http' && a.url === b.url
    case 'tcp': return b.kind === 'tcp' && a.port === b.port && left.host === right.host
  }
}
