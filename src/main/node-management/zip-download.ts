/// <reference types="vite/client" />
import { createHash } from 'node:crypto'
import { createMessage, readKeys, readSignature, verify } from 'openpgp'
import releaseKeyring from '../../../resources/node-release-keys/releases.asc?raw'
import { isNodeVersion, type NodeOperation } from '../../shared/node-management'
import { readDownload, type NodeFetch } from './catalog'

let keys: ReturnType<typeof readKeys> | undefined

export async function signedZipDigest(manifest: Buffer, signature: Buffer, filename: string) {
  keys ??= readKeys({ armoredKeys: releaseKeyring })
  await verify({
    verificationKeys: await keys,
    message: await createMessage({ binary: manifest }),
    signature: await readSignature({ binarySignature: signature }),
    expectSigned: true,
  })
  const entries = manifest.toString('utf8').split(/\r?\n/).map(line => /^([\da-f]{64}) {2}(.+)$/.exec(line))
    .filter(entry => entry?.[2] === filename)
  if (entries.length !== 1) throw Error('Missing or ambiguous signed archive digest')
  return entries[0]![1]
}

export class NodeZipDownloadError extends Error {
  constructor(readonly code: 'zip-download' | 'zip-integrity') { super(code) }
}

export async function downloadNodeZip(version: string, request: NodeFetch, phase: (value: NodeOperation['phase']) => void) {
  if (!isNodeVersion(version)) throw new NodeZipDownloadError('zip-integrity')
  const base = 'https://nodejs.org/dist/v' + version + '/'
  const filename = 'node-v' + version + '-win-x64.zip'
  async function fetchFile(name: string, limit: number) {
    try {
      const response = await request(base + name, { signal: AbortSignal.timeout(180_000), redirect: 'error', credentials: 'omit' })
      if (response.url && response.url !== base + name) {
        await response.body?.cancel()
        throw Error('Redirected distribution file')
      }
      return await readDownload(response, limit)
    } catch { throw new NodeZipDownloadError('zip-download') }
  }
  phase('downloading')
  const manifest = await fetchFile('SHASUMS256.txt', 1024 * 1024)
  const signature = await fetchFile('SHASUMS256.txt.sig', 64 * 1024)
  let digest: string
  try { digest = await signedZipDigest(manifest, signature, filename) }
  catch { throw new NodeZipDownloadError('zip-integrity') }
  const bytes = await fetchFile(filename, 256 * 1024 * 1024)
  phase('authenticating')
  if (createHash('sha256').update(bytes).digest('hex') !== digest) throw new NodeZipDownloadError('zip-integrity')
  return bytes
}
