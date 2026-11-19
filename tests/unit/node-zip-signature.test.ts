import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'
import { signedZipDigest } from '../../src/main/node-management/zip-download'

it('checks the official detached signature, binds the digest to the exact archive, and rejects modified manifest bytes', async () => {
  const root = 'tests/fixtures/node-dist/v24.22.1/SHASUMS256.txt'
  const [manifest, signature] = await Promise.all([readFile(root), readFile(root + '.sig')])
  const name = 'node-v24.22.1-win-x64.zip'
  expect(await signedZipDigest(manifest, signature, name)).toBe('d2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5')
  await expect(signedZipDigest(manifest, signature, 'node-v24.22.2-win-x64.zip')).rejects.toThrow()
  await expect(signedZipDigest(Buffer.concat([manifest, Buffer.from(' ')]), signature, name)).rejects.toThrow()
})
