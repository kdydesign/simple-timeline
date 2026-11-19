import { createHash } from 'node:crypto'
import { net, session } from 'electron'
import type { NodeFetch } from './catalog'

// Each proxy has a separate in-memory session so concurrent catalog and ZIP
// requests can never change each other's network route.
const transports = new Map<string, Promise<NodeFetch>>()
export async function officialNodeTransport(proxy?: string): Promise<NodeFetch> {
  if (!proxy) return (url, init) => net.fetch(url, init)
  const endpoint = new URL(proxy)
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.origin !== proxy) throw Error('Invalid nvm proxy')
  const id = createHash('sha256').update(proxy).digest('hex')
  let ready = transports.get(id)
  if (!ready) {
    const transport = session.fromPartition('workrail-node-dist-' + id, { cache: false })
    ready = transport.setProxy({ mode: 'fixed_servers', proxyRules: endpoint.origin })
      .then(() => (url: string, init?: RequestInit) => transport.fetch(url, init))
      .catch(error => { transports.delete(id); throw error })
    transports.set(id, ready)
  }
  return ready
}
