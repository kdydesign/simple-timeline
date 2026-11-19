import { createRequire } from 'node:module'
import { buffer } from 'node:stream/consumers'
import { expect, it, vi } from 'vitest'
import { verifyClassicRelease } from '../../src/main/node-management/official-classic'

const { ZipFile } = createRequire(import.meta.url)('yazl')
const executable = Buffer.from("MZ official archive fixture -X 'main.NvmVersion=1.3.4'")

async function archive(names: string[]) {
  const zip = new ZipFile()
  for (const name of names) zip.addBuffer(executable, name)
  const result = buffer(zip.outputStream)
  zip.end()
  return new Uint8Array(await result)
}

it('matches every byte with a fixed official release without executing the candidate', async () => {
  const data = await archive(['nvm.exe'])
  const request = vi.fn(async () => new Response(data))
  expect(await verifyClassicRelease(request, executable)).toBe('1.3.4')
  expect(request).toHaveBeenCalledWith('https://github.com/nvm-windows/nvm/releases/download/1.3.4/nvm-noinstall.zip', expect.objectContaining({ credentials: 'omit', redirect: 'manual' }))
  const modified = Buffer.from(executable)
  modified[4] ^= 1
  expect(await verifyClassicRelease(request, modified)).toBeNull()
})

it('rejects ambiguous executables, untrusted redirects and malformed release hints', async () => {
  const duplicate = await archive(['nvm.exe', 'NVM.EXE'])
  expect(await verifyClassicRelease(async () => new Response(duplicate), executable)).toBeNull()
  const redirected = vi.fn(async () => Response.redirect('https://example.invalid/nvm-noinstall.zip'))
  expect(await verifyClassicRelease(redirected, executable)).toBeNull()
  expect(redirected).toHaveBeenCalledTimes(1)
  const badHint = Buffer.from("MZ -X 'main.NvmVersion=1.2.3/other'")
  expect(await verifyClassicRelease(redirected, badHint)).toBeNull()
  expect(redirected).toHaveBeenCalledTimes(1)
})
