import { parseBusinessDate } from '../../domain/date'
import { isNodeVersion, type NodeRelease } from '../../shared/node-management'
import { compareStableVersions } from '../../shared/updates'

const CATALOG_URL = 'https://nodejs.org/dist/index.json'
const MAX_CATALOG_BYTES = 4 * 1024 * 1024
export type NodeFetch = (url: string, init?: RequestInit) => Promise<Response>

export function parseNodeCatalog(value: unknown): NodeRelease[] {
  if (!Array.isArray(value)) throw Error('Invalid Node release index')
  const releases = new Map<string, NodeRelease>()
  for (const row of value) {
    if (!row || typeof row !== 'object' || typeof row.version !== 'string' || !row.version.startsWith('v')) continue
    const version = row.version.slice(1)
    if (!isNodeVersion(version) || !Array.isArray(row.files) || !row.files.includes('win-x64-zip') || releases.has(version)) continue
    let date: string
    try {
      date = parseBusinessDate(row.date)
    } catch {
      continue
    }
    releases.set(version, {
      version,
      date,
      lts: typeof row.lts === 'string' && /^[A-Za-z][A-Za-z0-9 -]{0,31}$/.test(row.lts) ? row.lts : null,
      npm: isNodeVersion(row.npm) ? row.npm : null,
      security: row.security === true,
    })
  }
  if (!releases.size) throw Error('The Node release index contains no Windows x64 releases')
  return [...releases.values()].sort((a, b) => compareStableVersions(b.version, a.version))
}

export async function readDownload(response: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length'))
  if (!response.ok || !response.body || declared > maxBytes) {
    await response.body?.cancel()
    throw Error('Download unavailable or too large')
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) throw Error('Download exceeds size limit')
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  return Buffer.concat(chunks, size)
}

export async function loadNodeCatalog(request: NodeFetch): Promise<NodeRelease[]> {
  const response = await request(CATALOG_URL, { redirect: 'error', signal: AbortSignal.timeout(15_000) })
  const bytes = await readDownload(response, MAX_CATALOG_BYTES)
  return parseNodeCatalog(JSON.parse(bytes.toString('utf8')))
}

export async function fetchBoundedAsset(request: NodeFetch, source: string, allowedOrigins: ReadonlySet<string>, maxBytes: number) {
  const signal = AbortSignal.timeout(45_000)
  let url = new URL(source)
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await request(url.href, { redirect: 'manual', credentials: 'omit', signal })
    if (![301, 302, 303, 307, 308].includes(response.status)) return readDownload(response, maxBytes)
    await response.body?.cancel()
    const location = response.headers.get('location')
    if (!location) throw Error('No installer redirect target')
    url = new URL(location, url)
    if (!allowedOrigins.has(url.origin) || url.username || url.password) throw Error('Unexpected installer redirect')
  }
  throw Error('Too many installer redirects')
}
