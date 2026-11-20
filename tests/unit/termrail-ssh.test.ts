import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
  const server = new Server({ hostKeys: [utils.generateKeyPairSync('ed25519').private] }, connection => {
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

it.skipIf(process.platform !== 'linux').each(['new tab', 'restored pane'])(
  'runs startup once in interactive Bash for a %s and retains its state', async origin => {
  const directory = mkdtempSync(join(tmpdir(), 'termrail-startup-shell-'))
  const service = new TermRailSshService(join(directory, 'pins'))
  writeFileSync(join(directory, '.bashrc'), "from_rc=loaded\nPS1='term> '\n")
  const startup = {
    username: 'fixture-user', password: 'fixture-secret',
    body: [
      '#' + 'x'.repeat(42_000),
      'cd /tmp',
      'pwd',
      'while [[ ! -e "$HOME/continue" ]]; do sleep 0.02; done',
      'label="한글 \' \\ $"',
      'runs=$((runs + 1))',
      "printf 'started %s %s %s\\n' \"$from_rc\" \"$runs\" \"$label\"",
    ].join('\n'),
  }
  const users: string[] = []
  const remoteRequests: string[] = []
  const input: Buffer[] = []
  let terminals = 0
  const server = new Server({ hostKeys: [utils.generateKeyPairSync('ed25519').private] }, connection => {
    connection.on('error', () => {}).on('authentication', auth => {
      users.push(auth.username)
      if (auth.method === 'password' && auth.username === startup.username && auth.password === startup.password)
        return auth.accept()
      auth.reject(['password'])
    }).on('ready', () => {
      connection.on('session', accept => {
        accept().on('pty', permit => { terminals++; permit?.() }).on('exec', (permit, _deny, {command}) => {
          remoteRequests.push(command)
          const channel = permit()
          // util-linux script supplies a real controlling terminal for stty, readline, and Bash.
          const shell = spawn('script', ['-qef', '-E', 'always', '-c', command, '/dev/null'], {
            env: { PATH: process.env.PATH, HOME: directory, SHELL: '/bin/sh', TERM: 'dumb' },
          })
          channel.on('data', (data: Buffer) => input.push(data))
          channel.pipe(shell.stdin)
          shell.stdout.pipe(channel, { end: false })
          shell.stderr.pipe(channel.stderr, { end: false })
          shell.stdin.on('error', () => {})
          shell.on('close', code => { channel.exit(code ?? 1); channel.end() })
          channel.on('close', () => shell.kill())
        })
      })
    })
  })
  try {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const id = randomUUID()
    service.open(id, endpoint(server), origin === 'new tab' ? startup : undefined)
    await vi.waitFor(() => expect(service.read(id, 0).phase).toBe('host-key'))
    expect(() => service.prepareProfileStart(id)).toThrow()
    expect(users).toEqual([])
    service.trust(id, service.read(id, 0).fingerprint!)
    if (origin === 'restored pane') {
      await vi.waitFor(() => expect(service.read(id, 0).phase).toBe('login'))
      expect(users).toEqual([])
      const first = service.prepareProfileStart(id)
      const duplicate = service.prepareProfileStart(id)
      expect(first.endpoint).toEqual(endpoint(server))
      first.start(startup)
      expect(() => duplicate.start(startup)).toThrow()
    }
    await vi.waitFor(() => expect(service.read(id, 0).phase).toBe('connected'))
    await service.write(id, "printf 'interactive %s %s %s\\n' \"$PWD\" \"$runs\" \"$label\"\n")
    writeFileSync(join(directory, 'continue'), '')
    function readTranscript() { return Buffer.from(service.read(id, 0).data).toString().replaceAll('\r', '') }
    await vi.waitFor(() => expect(readTranscript()).toContain("interactive /tmp 1 한글 ' \\ $"))
    service.resize(id, 100, 40)
    const replay = readTranscript()
    expect(replay).toContain("/tmp\nstarted loaded 1 한글 ' \\ $")
    expect(replay.match(/started loaded/g)).toHaveLength(1)
    expect(users).toEqual([startup.username])
    expect(terminals).toBe(1)
    expect(Buffer.concat(input).toString()).toContain(startup.body)
    for (const value of [startup.username, startup.password]) {
      expect(replay).not.toContain(value)
      expect(remoteRequests.join('')).not.toContain(value)
      expect(Buffer.concat(input).toString()).not.toContain(value)
    }
    await service.write(id, 'exit\n')
    await vi.waitFor(() => expect(service.read(id, 0).phase).toBe('closed'))
  } finally {
    service.dispose()
    await new Promise<void>(resolve => server.close(() => resolve()))
    rmSync(directory, { recursive: true, force: true })
  }
})

it('reports an unavailable remote Bash and sends no file to an unprepared shell', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'termrail-bash-missing-'))
  const service = new TermRailSshService(join(directory, 'pins'))
  const input: Buffer[] = []
  const server = new Server({ hostKeys: [utils.generateKeyPairSync('ed25519').private] }, connection => {
    connection.on('error', () => {}).on('authentication', auth => auth.accept()).on('ready', () => {
      connection.on('session', accept => {
        accept().on('pty', permit => permit?.()).on('exec', permit => {
          const channel = permit()
          channel.on('data', (data: Buffer) => input.push(data))
          channel.exit(127)
          channel.end('bash: command not found\n')
        })
      })
    })
  })
  try {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const id = randomUUID()
    service.open(id, endpoint(server), { username: 'fixture', password: 'fixture-only', body: 'pwd' })
    await vi.waitFor(() => expect(service.read(id, 0).phase).toBe('host-key'))
    service.trust(id, service.read(id, 0).fingerprint!)
    await vi.waitFor(() => expect(service.read(id, 0).phase).toBe('failed'))
    expect(service.read(id, 0).message).toMatch(/Bash/)
    expect(input).toEqual([])
  } finally {
    service.dispose()
    await new Promise<void>(resolve => server.close(() => resolve()))
    rmSync(directory, { recursive: true, force: true })
  }
})
