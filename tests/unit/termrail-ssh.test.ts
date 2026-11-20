import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Server, type ServerChannel } from 'ssh2'
import { expect, it, vi } from 'vitest'
import { TermRailSshService } from '../../src/main/termrail/ssh-service'
import { createTestSshHostKey } from '../fixtures/ssh-host-key'

function endpoint(server: Server) {
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing TCP listener address')
  return { host: address.address, port: address.port }
}

it('verifies the host before login and keeps PTY output, dimensions, and pins across readers', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'termrail-ssh-'))
  const pinFile = join(directory, 'hosts.json')
  const service = new TermRailSshService(pinFile)
  const key = createTestSshHostKey()
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
    const key = createTestSshHostKey()
    const server = new Server({ hostKeys: [key] }, connection => {
      connection.on('error', () => {}).on('authentication', auth => {
        attempts.push(auth.username)
        auth.reject()
      })
    })
    server.listen(port, '127.0.0.1')
    return server
  }
  const startup = { username: 'rotated-user', password: 'test-only', body: 'pwd' }
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
    service.open(id, target, startup)
    await vi.waitFor(() => expect(service.read(id, 0).phase).toBe('host-key'))
    const changed = service.read(id, 0)
    expect(changed.previousFingerprint).toBe(oldKey)
    expect(changed.fingerprint).not.toBe(oldKey)
    expect(() => service.trust(id, oldKey)).toThrow()
    service.close(id)
    expect(attempts).toEqual([])

    service.open(id, target, startup)
    await vi.waitFor(() => expect(service.read(id, 0).previousFingerprint).toBe(oldKey))
    service.trust(id, changed.fingerprint!)
    await vi.waitFor(() => expect(service.read(id, 0).phase).toBe('failed'))
    expect(attempts).toEqual(['rotated-user'])
  } finally {
    service.dispose()
    await new Promise<void>(resolve => server.close(() => resolve()))
    rmSync(directory, { recursive: true, force: true })
  }
})

it('sends a stored login once after host approval and opens no shell after rejection or cancellation', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'termrail-startup-login-'))
  const service = new TermRailSshService(join(directory, 'pins'))
  const startup = { username: 'fixture-user', password: 'fixture-password', body: 'pwd' }
  const users: string[] = []
  let sessions = 0
  const server = new Server({ hostKeys: [createTestSshHostKey()] }, connection => {
    connection.on('error', () => {}).on('authentication', auth => {
      users.push(auth.username)
      auth.reject(['password'])
    }).on('session', () => { sessions++ })
  })
  try {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const target = endpoint(server)
    const id = randomUUID()
    service.open(id, target, startup)
    await vi.waitFor(() => expect(service.read(id, 0).phase).toBe('host-key'))
    service.close(id)
    expect(users).toEqual([])
    service.open(id, target, startup)
    await vi.waitFor(() => expect(service.read(id, 0).phase).toBe('host-key'))
    service.trust(id, service.read(id, 0).fingerprint!)
    await vi.waitFor(() => expect(service.read(id, 0).phase).toBe('failed'))
    expect(service.read(id, 0).message).toMatch(/인증/)
    expect(users).toEqual(['fixture-user'])
    service.close(id)
    service.open(id, target)
    await vi.waitFor(() => expect(service.read(id, 0).phase).toBe('login'))
    const stale = service.prepareProfileStart(id)
    service.close(id)
    service.open(id, target)
    await vi.waitFor(() => expect(service.read(id, 0).phase).toBe('login'))
    expect(() => stale.start(startup)).toThrow()
    expect(users).toEqual(['fixture-user'])
    expect(sessions).toBe(0)
  } finally {
    service.dispose()
    await new Promise<void>(resolve => server.close(() => resolve()))
    rmSync(directory, { recursive: true, force: true })
  }
})

const shellPrompt = '\x1b]133;A\x07remote@fixture:~$ \x1b]133;B\x07'
const username = 'fixture-user'
const password = 'fixture-secret'

async function withStartupShell(run: (fixture: {
  directory: string
  service: TermRailSshService
  id: string
  target: ReturnType<typeof endpoint>
  users: string[]
  input: () => string
  transcript: () => string
  requests: string[]
  openShell: (accept: () => ServerChannel, reject: () => void) => void
}) => Promise<void>) {
  const directory = mkdtempSync(join(tmpdir(), 'termrail-default-shell-'))
  const service = new TermRailSshService(join(directory, 'pins'))
  const id = randomUUID()
  const users: string[] = []
  const requests: string[] = []
  const input: Buffer[] = []
  const server = new Server({ hostKeys: [createTestSshHostKey()] }, connection => {
    connection.on('error', () => {}).on('authentication', auth => {
      users.push(auth.username)
      if (auth.method === 'password' && auth.username === username && auth.password === password)
        return auth.accept()
      auth.reject(['password'])
    }).on('ready', () => {
      connection.on('session', accept => {
        accept().on('pty', permit => { requests.push('pty'); permit?.() })
          .on('exec', (_permit, reject) => { requests.push('exec'); reject() })
          .on('shell', (permit, reject) => {
            requests.push('shell')
            fixture.openShell(() => {
              const channel = permit()
              channel.on('data', (chunk: Buffer) => input.push(chunk))
              return channel
            }, reject)
          })
      })
    })
  })
  const fixture = {
    directory, id, service, users, requests,
    get target() { return endpoint(server) },
    transcript: () => Buffer.from(service.read(id, 0).data).toString(),
    input: () => Buffer.concat(input).toString(),
    openShell: (_accept: () => ServerChannel, reject: () => void) => reject(),
  }
  try {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    await run(fixture)
  } finally {
    service.dispose()
    await new Promise<void>(resolve => server.close(() => resolve()))
    rmSync(directory, { recursive: true, force: true })
  }
}

it.skipIf(process.platform !== 'linux').each([
  { origin: 'headers only', body: '' },
  { origin: 'new tab', body: 'ls\n' },
  { origin: 'restored pane', body: 'pwd\nls\n' },
])('opens the normal interactive shell for $origin and keeps it available for typing', async ({origin, body}) => {
  await withStartupShell(async fixture => {
    const { directory, service, id, target, transcript, input, requests, users } = fixture
    writeFileSync(join(directory, 'listing-witness.txt'), '')
    writeFileSync(join(directory, '.bashrc'), "PS1='remote@fixture:~$ '\nbind 'set enable-bracketed-paste on'\n")
    fixture.openShell = accept => {
      const channel = accept()
      // util-linux script gives the server's normal Bash a controlling PTY and readline.
      const shell = spawn('script', ['-qef', '-c', '/bin/bash -i', '/dev/null'], {
        cwd: directory, env: { PATH: process.env.PATH, HOME: directory, SHELL: '/bin/bash', TERM: 'xterm-256color' },
      })
      channel.pipe(shell.stdin)
      shell.stdout.pipe(channel, { end: false })
      shell.stderr.pipe(channel.stderr, { end: false })
      shell.stdin.on('error', () => {})
      shell.on('close', code => { channel.exit(code ?? 1); channel.end() })
      channel.on('close', () => shell.kill())
    }
    const startup = { username, password, body }
    service.open(id, target, origin === 'restored pane' ? undefined : startup)
    await vi.waitFor(() => expect(service.read(id, 0).phase).toBe('host-key'))
    expect(() => service.prepareProfileStart(id)).toThrow()
    expect(users).toEqual([])
    service.trust(id, service.read(id, 0).fingerprint!)
    if (origin === 'restored pane') {
      await vi.waitFor(() => expect(service.read(id, 0).phase).toBe('login'))
      expect(users).toEqual([])
      const first = service.prepareProfileStart(id)
      const duplicate = service.prepareProfileStart(id)
      expect(first.endpoint).toEqual(target)
      first.start(startup)
      expect(() => duplicate.start(startup)).toThrow()
    }
    await vi.waitFor(() => expect(service.read(id, 0).phase).toBe('connected'))
    if (body) {
      await vi.waitFor(() => expect(transcript()).toContain('listing-witness.txt'))
      if (origin === 'restored pane') expect(transcript()).toContain(directory)
    } else {
      await vi.waitFor(() => expect(transcript()).toContain('remote@fixture:~$ '))
      expect(service.read(id, 0).startupInput).toBeUndefined()
    }
    const manual = "printf 'manual-%s\\n' response\r"
    await service.write(id, manual)
    await vi.waitFor(() => expect(transcript()).toContain('manual-response'))
    service.resize(id, 100, 40)
    expect(input()).toBe(body.replaceAll('\n', '\r') + manual)
    expect(requests).toEqual(['pty', 'shell'])
    expect(users).toEqual([username])
    expect(transcript()).not.toContain(password)
    expect(transcript()).not.toContain(username)
    await service.write(id, 'exit\r')
    await vi.waitFor(() => expect(service.read(id, 0).phase).toBe('closed'))
  })
})

it.each(['question', 'continuation prompt', 'user keystroke'])('stops queued input after a %s and preserves the session', async reason => {
  await withStartupShell(async fixture => {
    const { service, id, target, input, transcript } = fixture
    let shell!: ServerChannel
    fixture.openShell = permit => { shell = permit() }
    service.open(id, target, { username, password, body: 'pwd\nls\n' })
    await vi.waitFor(() => expect(service.read(id, 0).phase).toBe('host-key'))
    service.trust(id, service.read(id, 0).fingerprint!)
    await vi.waitFor(() => expect(service.read(id, 0)).toMatchObject({phase: 'connected', startupInput: 'waiting'}))
    expect(input()).toBe('')
    shell.write(shellPrompt)
    await vi.waitFor(() => expect(input()).toBe('pwd\r'))
    shell.write('pwd\r\n/fixture/$\r\n')
    await vi.waitFor(() => expect(transcript()).toContain('/fixture/$'))
    expect(input()).toBe('pwd\r')
    if (reason !== 'user keystroke') {
      shell.write(reason === 'question' ? 'Continue? [y/n] ' : '> ')
      await vi.waitFor(() => expect(service.read(id, 0).startupInput).toBe('manual'))
    }
    await service.write(id, 'y\r')
    await vi.waitFor(() => expect(input()).toBe('pwd\ry\r'))
    shell.write('\r\n' + shellPrompt)
    await vi.waitFor(() => expect(transcript()).toContain('\r\n' + shellPrompt))
    expect(service.read(id, 0).phase).toBe('connected')
    await service.write(id, 'echo manual\r')
    await vi.waitFor(() => expect(input()).toBe('pwd\ry\recho manual\r'))
  })
})

it.each(['a prompt redraw', 'the prompt wait expires'])('keeps the shell interactive after %s', async reason => {
  await withStartupShell(async fixture => {
    const { service, id, target, input, transcript } = fixture
    let shell!: ServerChannel
    fixture.openShell = permit => { shell = permit() }
    service.open(id, target, { username, password, body: 'pwd\nls' })
    await vi.waitFor(() => expect(service.read(id, 0).phase).toBe('host-key'))
    service.trust(id, service.read(id, 0).fingerprint!)
    await vi.waitFor(() => expect(service.read(id, 0).startupInput).toBe('waiting'))

    if (reason === 'the prompt wait expires') {
      // Only virtualize the second prompt's deadline. SSH uses a real loopback socket.
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldClearNativeTimers: true })
      try {
        const firstInput = once(shell, 'data')
        shell.write(shellPrompt)
        await firstInput
        expect(input()).toBe('pwd\r')
        vi.advanceTimersByTime(9_999)
        expect(service.read(id, 0).startupInput).toBe('waiting')
        vi.advanceTimersByTime(1)
      } finally {
        vi.useRealTimers()
      }
    } else {
      shell.write(shellPrompt)
      await vi.waitFor(() => expect(input()).toBe('pwd\r'))
      // A separate packet redraws the prompt before the server echoes or executes pwd.
      shell.write(shellPrompt)
    }
    await vi.waitFor(() => expect(service.read(id, 0)).toMatchObject({phase: 'connected', startupInput: 'manual'}))
    expect(input()).toBe('pwd\r')
    const result = 'pwd\r\n/fixture/work\r\n' + shellPrompt
    shell.write(result)
    await vi.waitFor(() => expect(transcript()).toContain(result))
    await service.write(id, 'echo manual\r')
    await vi.waitFor(() => expect(input()).toBe('pwd\recho manual\r'))
  })
})

it('reports shell-open failure separately from password authentication', async () => {
  await withStartupShell(async fixture => {
    const { id, target, service, input, requests } = fixture
    let rejectShell: (() => void) | undefined
    fixture.openShell = (_accept, reject) => { rejectShell = reject }
    service.open(id, target, { username, password, body: 'pwd' })
    await vi.waitFor(() => expect(service.read(id, 0).phase).toBe('host-key'))
    service.trust(id, service.read(id, 0).fingerprint!)
    await vi.waitFor(() => {
      expect(service.read(id, 0).phase).toBe('opening-shell')
      expect(rejectShell).toBeDefined()
    })
    rejectShell!()
    await vi.waitFor(() => expect(service.read(id, 0).phase).toBe('failed'))
    expect(service.read(id, 0).message).toMatch(/터미널/)
    expect(requests).toEqual(['pty', 'shell'])
    expect(input()).toBe('')
  })
})
