import { once } from 'node:events'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Server, utils, type ServerChannel } from 'ssh2'
import { expect, it, vi } from 'vitest'
import { TermRailSshService } from '../../src/main/termrail/ssh-service'

function endpoint(server: Server) {
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing TCP listener address')
  return { host: address.address, port: address.port }
}

it('verifies the host before login and keeps PTY output, dimensions, and pins across readers', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'termrail-ssh-'))
  const pinFile = join(directory, 'hosts.json')
  const service = new TermRailSshService(pinFile)
  const key = utils.generateKeyPairSync('ed25519').private
  const logins: string[] = []
  const dimensions: string[] = []
  let shell: ServerChannel | undefined
  const server = new Server({ hostKeys: [key] }, connection => {
    connection.on('error', () => {})
    connection.on('authentication', auth => {
      if (auth.method === 'password') {
        logins.push(auth.username)
        if (auth.password === 'test-only-password') return auth.accept()
      }
      auth.reject(['password'])
    }).on('ready', () => {
      connection.on('session', accept => {
        accept().on('pty', (permit, _deny, info) => {
          dimensions.push(`${info.cols}x${info.rows}`)
          permit?.()
        }).on('window-change', (_permit, _deny, info) => {
          dimensions.push(`${info.cols}x${info.rows}`)
        }).on('shell', permit => {
          shell = permit()
          shell.on('data', (chunk: Buffer) => shell?.write(chunk))
        })
      })
    })
  })
  try {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const target = endpoint(server)
    const id = randomUUID()
    service.open(id, target)
    await vi.waitFor(() => expect(service.read(id, 0).phase).toBe('host-key'))
    const fingerprint = service.read(id, 0).fingerprint!
    expect(() => service.login(id, 'test-only-user', 'test-only-password')).toThrow()
    expect(() => service.trust(id, 'wrong key')).toThrow()
    expect(logins).toEqual([])
    service.trust(id, fingerprint)
    await vi.waitFor(() => expect(service.read(id, 0).phase).toBe('login'))
    service.resize(id, 100, 35)
    service.login(id, 'test-only-user', 'test-only-password')
    await vi.waitFor(() => expect(service.read(id, 0).phase).toBe('connected'))
    const input = '터미널\r'
    await service.write(id, input)
    await vi.waitFor(() => expect(Buffer.from(service.read(id, 0).data).toString()).toBe(input))
    service.resize(id, 120, 41)
    await vi.waitFor(() => expect(dimensions).toEqual(['100x35', '120x41']))
    const initial = service.read(id, 0)
    const payload = randomBytes(430_000)
    shell!.write(payload)
    let cursor = initial.nextCursor
    const chunks: Buffer[] = []
    let received = 0
    await vi.waitFor(() => {
      const page = service.read(id, cursor)
      expect(page.truncated).toBe(false)
      chunks.push(Buffer.from(page.data))
      received += page.data.byteLength
      cursor = page.nextCursor
      expect(received).toBe(payload.byteLength)
    }, { interval: 5, timeout: 4000 })
    expect(Buffer.concat(chunks).equals(payload)).toBe(true)
    expect(service.read(id, 0).truncated).toBe(true)
    shell!.exit(0)
    shell!.end('마지막 출력')
    await vi.waitFor(() => {
      const last = service.read(id, cursor)
      expect(Buffer.from(last.data).toString()).toBe('마지막 출력')
      expect(last.phase).toBe('closed')
    })
    const stored = readFileSync(pinFile, 'utf8')
    expect(stored).toContain(fingerprint)
    expect(stored).not.toContain('test-only')
    service.close(id)

    const second = randomUUID()
    service.open(second, target)
    await vi.waitFor(() => expect(service.read(second, 0).phase).toBe('login'))
    service.login(second, 'second', 'incorrect')
    await vi.waitFor(() => expect(service.read(second, 0).phase).toBe('failed'))
    expect(logins).toEqual(['test-only-user', 'second'])
  } finally {
    service.dispose()
    await new Promise<void>(resolve => server.close(() => resolve()))
    rmSync(directory, { recursive: true, force: true })
  }
})

it('requires approval of a changed host key at the same endpoint and cancels a pending handshake', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'termrail-rotation-'))
  const service = new TermRailSshService(join(directory, 'pins'))
  const attempts: string[] = []
  function startServer(port: number) {
    const key = utils.generateKeyPairSync('ed25519').private
    const server = new Server({ hostKeys: [key] }, connection => {
      connection.on('error', () => {}).on('authentication', auth => {
        attempts.push(auth.username)
        auth.reject()
      })
    })
    server.listen(port, '127.0.0.1')
    return server
  }
  let server = startServer(0)
  try {
    await once(server, 'listening')
    const target = endpoint(server)
    const id = randomUUID()
    service.open(id, target)
    await vi.waitFor(() => expect(service.read(id, 0).phase).toBe('host-key'))
    const oldKey = service.read(id, 0).fingerprint!
    service.trust(id, oldKey)
    await vi.waitFor(() => expect(service.read(id, 0).phase).toBe('login'))
    service.dispose()
    expect(() => service.read(id, 0)).toThrow()
    await new Promise<void>(resolve => server.close(() => resolve()))

    server = startServer(target.port)
    await once(server, 'listening')
    service.open(id, target)
    await vi.waitFor(() => expect(service.read(id, 0).phase).toBe('host-key'))
    const changed = service.read(id, 0)
    expect(changed.previousFingerprint).toBe(oldKey)
    expect(changed.fingerprint).not.toBe(oldKey)
    expect(() => service.trust(id, oldKey)).toThrow()
    service.close(id)
    expect(attempts).toEqual([])

    service.open(id, target)
    await vi.waitFor(() => expect(service.read(id, 0).previousFingerprint).toBe(oldKey))
    service.trust(id, changed.fingerprint!)
    await vi.waitFor(() => expect(service.read(id, 0).phase).toBe('login'))
    expect(attempts).toEqual([])
  } finally {
    service.dispose()
    await new Promise<void>(resolve => server.close(() => resolve()))
    rmSync(directory, { recursive: true, force: true })
  }
})
