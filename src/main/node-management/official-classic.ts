import { createHash } from 'node:crypto'
import { on } from 'node:events'
import { type Readable } from 'node:stream'
import { fromBuffer, type Entry, type ZipFile } from 'yauzl'
import { fetchBoundedAsset, type NodeFetch } from './catalog'

const assetOrigins = new Set(['https://release-assets.githubusercontent.com', 'https://objects.githubusercontent.com'])
const maxExecutableBytes = 32 * 1024 * 1024

// Official stable Windows release executables that predate or supplement the embedded
// build hint. The 1.0.1 and 1.0.2 installers contain the same 1.0.1 executable.
const offlineReleases = new Map([
  ['cd45b9b2d9cc211fe4da4fa8c2794bd2e1892bb7ed082486e7f7d598c26b65df', '1.0.0'],
  ['cefeaa2f861791bce486bb8c0d8dd4d96661c576ba942afd3c49b8de55bb1254', '1.0.1'],
  ['2b1925f03a075ef2dd2045837a0871b872384760496e63fc1bde0f0264b57194', '1.0.3'],
  ['4603303911f2d1f2f1bd3fc949f7828c85646540d32f609d9fb29a16a7f414e6', '1.0.4'],
  ['35b20876cb1b0a38a88ccf72937e6db4925b4fdc2f40c4a9d87f29e42ea49dd8', '1.0.5'],
  ['760fa792f1bd3f593774f8174635ab3acad5357870883f91312b8ae304e05948', '1.0.6'],
  ['7bd35e4cb240d8658935b75f15932a2acbbbcf0aeb59c230b684664b66dafd55', '1.1.0'],
  ['b194e2ebb14b5694dbabb88d9beb3a366aa4e1b3767586ae7a6cbae994160978', '1.1.1'],
  ['39f3c2a21d7f1551a98dba367fd667d165aa4851c097078f772bea45d0160dff', '1.1.2'],
  ['c27ea7403130d43ac5d00728f28fe8d3fac1d79acf5a65458bf77cb76718b0f7', '1.1.3'],
  ['d41e25833c976903cc9d6931d2ff81e3959791b1d24f016a192cba9efe27d651', '1.1.4'],
  ['fbe629338ffdd8543a15eff08d4b7931a2ad3616ab0390a24f62c8ea6583dd3a', '1.1.5'],
  ['dfc7c7e53091fc44c0d7d6b7e215ec70c2fd6e9b50eccf9982941f9c62d5638b', '1.1.6'],
  ['d3f7565c6f90988b6c8c0f561ce8da4c931e5948d039788ab102e0908a1139cc', '1.1.7'],
  ['93400ed583d04e92c470405a44735883cd5b40c634eecd107e34985e64411232', '1.1.8'],
  ['f6384808865831f87473481744b621150abeb3cf971270e5625e4cc829becc6a', '1.1.9'],
  ['09c0b24ae56d26cc2aa8c1d583e5c1e58e11c425b0e899ec3124c5551e8f4373', '1.1.12'],
  ['b72e6749e5f990666f7a9784c57cde6634c5021ae566cbdb31e39fbb3449b606', '1.2.0'],
  ['c575eae8277e0b326d620690a00b6f611701db69f388e5fb4a76a52f97616eec', '1.2.1'],
])

// The untrusted local build flag selects a candidate archive. Only a full byte
// match with the executable in that official release establishes its identity.
export async function verifyClassicRelease(request: NodeFetch, bytes: Buffer): Promise<string | null> {
  if (bytes.length > maxExecutableBytes || bytes.toString('ascii', 0, 2) !== 'MZ') return null
  const offline = offlineReleases.get(createHash('sha256').update(bytes).digest('hex'))
  if (offline) return offline
  const match = /-X '?main\.NvmVersion=(1\.(?:0|[1-9]\d{0,3})\.(?:0|[1-9]\d{0,3}))(?=['"\s])/.exec(bytes.toString('latin1'))
  if (!match) return null
  const version = match[1]
  const url = 'https://github.com/nvm-windows/nvm/releases/download/' + version + '/nvm-noinstall.zip'
  let zip: ZipFile | undefined
  try {
    const archive = await fetchBoundedAsset(request, url, assetOrigins, maxExecutableBytes)
    zip = await new Promise<ZipFile>((resolve, reject) => {
      fromBuffer(archive, { lazyEntries: true }, (error, file) => error ? reject(error) : resolve(file))
    })
    if (zip.entryCount > 128) return null
    const entries = on(zip, 'entry', { close: ['end'] })
    let matched = false
    zip.readEntry()
    for await (const [item] of entries) {
      const entry: Entry = item
      if (entry.fileName.toLowerCase() === 'nvm.exe') {
        if (matched || entry.fileName !== 'nvm.exe' || entry.uncompressedSize !== bytes.length || entry.isEncrypted()) return null
        const source = zip
        const stream = await new Promise<Readable>((resolve, reject) => {
          source.openReadStream(entry, (error, value) => error ? reject(error) : resolve(value))
        })
        let offset = 0
        for await (const piece of stream) {
          const chunk = Buffer.from(piece)
          if (!chunk.equals(bytes.subarray(offset, offset + chunk.length))) return null
          offset += chunk.length
        }
        if (offset !== bytes.length) return null
        matched = true
      }
      zip.readEntry()
    }
    return matched ? version : null
  } catch {
    return null
  } finally {
    zip?.close()
  }
}
