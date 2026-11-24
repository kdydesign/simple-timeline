import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {mkdtempSync, mkdirSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Server, type Connection, type ServerChannel} from 'ssh2'
import {expect, it, vi} from 'vitest'
import {DeviceMacros} from '../../src/main/devicerail/macros'
import type {DeviceMacro, DeviceMacroRun, RailDevice} from '../../src/shared/device-rail'
import {createTestSshHostKey} from '../fixtures/ssh-host-key'

async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'devicerail-macro-'))
  mkdirSync(join(directory, 'nested'))
  const pinFile = join(directory, 'hosts.json')
  const macros = new DeviceMacros(pinFile)
  const users: string[] = []
  const peers = new Set<Connection>()
  const requests: string[] = []
  let exec: (command:string, channel:ServerChannel) => void = (_cmd, channel) => {
    channel.exit(0)
    channel.end()
  }
  async function listen(port:number) {
    const server = new Server({hostKeys:[createTestSshHostKey()]}, peer => {
      peers.add(peer)
      peer.on('error', () => {}).once('close', () => peers.delete(peer))
      peer.on('authentication', auth => {
        if (auth.method === 'password') {
          users.push(auth.username)
          if (auth.password === 'fixture-password') return auth.accept()
        }
        auth.reject(['password'])
      }).on('ready', () => peer.on('session', accept => {
        accept().on('exec', (permit, _reject, {command}) => {
          requests.push(command)
          exec(command, permit())
        })
      }))
    })
    server.listen(port, '127.0.0.1')
    await once(server, 'listening')
    return server
  }
  let server = await listen(0)
  const target = server.address()
  if (!target || typeof target === 'string') throw Error('Missing test SSH port')
  const {address:host, port} = target
  const macro:DeviceMacro = {id:'m1',name:'test macro',commands:'pwd'}
  const device:RailDevice = {id:'d1',name:'test device',host,port,location:'',description:'',favorite:false,service:{kind:'none'},macros:[macro]}
  const run = () => macros.state(device.id).runs.find(row => row.macroId === macro.id)!
  const phase = async (expected:DeviceMacroRun['phase']) => {
    await vi.waitFor(() => expect(run()?.phase).toBe(expected), {timeout:2500, interval:10})
    return run()
  }
  async function stopServer() {
    for (const peer of peers) peer.end()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
  return {directory, pinFile, macros, device, macro, users, requests, run, phase, peers,
    onExec(handler:typeof exec) {exec = handler},
    async rotate() {await stopServer(); server = await listen(port)},
    async close() {macros.dispose(); await stopServer(); rmSync(directory, {recursive:true,force:true})},
  }
}

it('binds host approval and password login to the pending run, including after key rotation', async () => {
  const f = await fixture()
  try {
    const id = f.macros.start(f.device, f.macro)
    const first = await f.phase('host-key')
    expect(() => f.macros.login(f.device.id, id, 'operator', 'fixture-password')).toThrow()
    expect(() => f.macros.start(f.device, f.macro)).toThrow()
    expect(() => f.macros.trust(f.device.id, id, 'wrong-key')).toThrow()
    expect(f.users).toEqual([])
    f.macros.trust(f.device.id, id, first.fingerprint!)
    await f.phase('login')
    expect(() => f.macros.login(f.device.id, 'stale', 'operator', 'fixture-password')).toThrow()
    f.macros.login(f.device.id, id, 'operator', 'fixture-password')
    await f.phase('succeeded')
    expect(f.macros.state(f.device.id).account).toBe('operator')
    expect(f.users).toEqual(['operator'])
    expect(readFileSync(f.pinFile,'utf8')).not.toContain('operator')
    f.macros.disconnect(f.device.id)
    await f.rotate()
    const second = f.macros.start(f.device, f.macro)
    const changed = await f.phase('host-key')
    expect(changed.previousFingerprint).toBe(first.fingerprint)
    expect(changed.fingerprint).not.toBe(first.fingerprint)
    expect(() => f.macros.trust(f.device.id, second, first.fingerprint!)).toThrow()
    f.macros.disconnect(f.device.id)
    expect(() => f.macros.trust(f.device.id, second, changed.fingerprint!)).toThrow()
    expect(f.users).toEqual(['operator'])
    expect(f.requests).toHaveLength(1)
  } finally {await f.close()}
})

it.skipIf(process.platform !== 'linux')('keeps cwd within one Linux shell, stops on failure and opens a fresh channel on reuse', async () => {
  const f = await fixture()
  f.onExec((cmd, channel) => {
    const child = spawn('/bin/sh', ['-c', cmd], {cwd:f.directory, env:{PATH:process.env.PATH}})
    channel.pipe(child.stdin)
    child.stdin.on('error', () => {})
    child.stdout.pipe(channel, {end:false})
    child.stderr.pipe(channel.stderr, {end:false})
    child.on('close', code => {channel.exit(code ?? 1); channel.end()})
  })
  try {
    f.macro.commands = "cd nested\npwd\nprintf 'problem' >&2\nfalse\nprintf 'ran too far'"
    const id = f.macros.start(f.device, f.macro)
    f.macros.trust(f.device.id, id, (await f.phase('host-key')).fingerprint!)
    await f.phase('login')
    f.macros.login(f.device.id, id, 'operator', 'fixture-password')
    const first = await f.phase('failed')
    expect(first).toMatchObject({exitCode:1,stdout:join(f.directory, 'nested')+'\n',stderr:'problem'})
    f.macro.commands = 'pwd'
    f.macros.start(f.device,f.macro)
    const second = await f.phase('succeeded')
    expect(second).toMatchObject({exitCode:0,stdout:f.directory+'\n'})
    f.macro.commands = [
      '# preserve multiline POSIX commands and literal contents',
      'if test -d nested; then',
      '  cd nested',
      'fi',
      "cat <<'TEXT'",
      "quoted ' \" && $HOME",
      'TEXT',
      "printf '%s' " + '\\',
      "'continued '",
      "printf 'multi",
      "line'",
      'pwd',
      'cd missing-folder && pwd',
      "printf 'ran too far'",
    ].join('\n')
    f.macros.start(f.device,f.macro)
    await vi.waitFor(() => expect(f.run().finishedAt).toBeDefined())
    const compound = f.run()
    expect(compound.phase).toBe('failed')
    expect(compound.exitCode).toBeGreaterThan(0)
    expect(compound.stdout).toBe("quoted ' \" && $HOME\ncontinued multi\nline" + join(f.directory, 'nested') + '\n')
    expect(f.requests).toHaveLength(3)
    expect(f.users).toEqual(['operator'])
  } finally {await f.close()}
})

it('keeps bounded output and reports an interrupted command without retrying or reusing credentials', async () => {
  const f = await fixture()
  try {
    f.onExec((_cmd,channel) => {
      channel.write(Buffer.alloc(512 * 1024, 65))
      channel.stderr.write('fixture error')
    })
    const id = f.macros.start(f.device, f.macro)
    f.macros.trust(f.device.id, id, (await f.phase('host-key')).fingerprint!)
    await f.phase('login')
    f.macros.login(f.device.id, id, 'operator', 'fixture-password')
    await vi.waitFor(() => expect(f.run().truncated).toBe(true))
    expect(f.run().stdout.length).toBeLessThan(512 * 1024)
    expect(() => f.macros.start(f.device,f.macro)).toThrow()
    for (const peer of f.peers) peer.end()
    await f.phase('uncertain')
    expect(f.macros.state(f.device.id).account).toBeUndefined()
    expect(f.requests).toHaveLength(1)
    f.macros.start(f.device,f.macro)
    await f.phase('login')
    expect(f.users).toEqual(['operator'])
    expect(f.requests).toHaveLength(1)
  } finally {await f.close()}
})

it('isolates accounts on two registrations at the same endpoint and invalidates only the removed device', async () => {
  const f = await fixture()
  try {
    const other = {...f.device,id:'d2',name:'second registration'}
    const first = f.macros.start(f.device, f.macro)
    f.macros.trust(f.device.id, first, (await f.phase('host-key')).fingerprint!)
    await f.phase('login')
    f.macros.login(f.device.id, first, 'first-user', 'fixture-password')
    await f.phase('succeeded')

    const second = f.macros.start(other, f.macro)
    await vi.waitFor(() => expect(f.macros.state(other.id).runs[0]?.phase).toBe('login'))
    expect(() => f.macros.login(f.device.id, second, 'other-user', 'fixture-password')).toThrow()
    f.macros.login(other.id, second, 'other-user', 'fixture-password')
    await vi.waitFor(() => expect(f.macros.state(other.id).runs[0]?.phase).toBe('succeeded'))

    f.macros.remove(f.device.id)
    expect(f.macros.state(f.device.id)).toMatchObject({runs:[],account:undefined})
    expect(f.macros.state(other.id).account).toBe('other-user')
    f.macros.start(other, f.macro)
    await vi.waitFor(() => expect(f.macros.state(other.id).runs[0]?.phase).toBe('succeeded'))
    expect(f.users).toEqual(['first-user','other-user'])

    const again = f.macros.start(f.device, f.macro)
    await f.phase('login')
    f.macros.login(f.device.id, again, 'failed-user','wrong password')
    await f.phase('failed')
    expect(f.users).toEqual(['first-user','other-user','failed-user'])
    expect(f.requests).toHaveLength(3)
  } finally {await f.close()}
})

it('clears an unanswered fingerprint prompt at its deadline and rejects stale approval after disposal', async () => {
  const f = await fixture()
  try {
    vi.useFakeTimers({toFake:['setTimeout','clearTimeout'], shouldClearNativeTimers:true})
    const id = f.macros.start(f.device,f.macro)
    const {fingerprint} = await f.phase('host-key')
    vi.advanceTimersByTime(120_000)
    expect(f.run()).toMatchObject({phase:'failed', message:expect.stringMatching(/시간/),finishedAt:expect.any(Number)})
    expect(() => f.macros.trust(f.device.id,id,fingerprint!)).toThrow()
    expect(f.requests).toHaveLength(0)

    const next = f.macros.start(f.device,f.macro)
    await f.phase('host-key')
    f.macros.dispose()
    expect(() => f.macros.trust(f.device.id,next,fingerprint!)).toThrow()
    expect(() => f.macros.start(f.device,f.macro)).toThrow()
    expect(f.users).toHaveLength(0)
  } finally {
    vi.useRealTimers()
    await f.close()
  }
})

it('preserves an explicit exit status when the transport closes before the channel close packet', async () => {
  const f = await fixture()
  try {
    f.onExec((_command, channel) => {
      channel.exit(17)
      for (const peer of f.peers) peer.end()
    })
    const id = f.macros.start(f.device, f.macro)
    f.macros.trust(f.device.id, id, (await f.phase('host-key')).fingerprint!)
    await f.phase('login')
    f.macros.login(f.device.id, id, 'operator', 'fixture-password')
    await vi.waitFor(() => expect(f.run().finishedAt).toBeDefined())
    expect(f.run()).toMatchObject({phase:'failed', exitCode:17})
    expect(f.macros.state(f.device.id).account).toBeUndefined()
  } finally {await f.close()}
})
