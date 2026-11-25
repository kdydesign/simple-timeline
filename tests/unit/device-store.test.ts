import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {afterEach, beforeEach, expect, it} from 'vitest'
import {DeviceStore} from '../../src/main/devicerail/store'
import type {RailDevice} from '../../src/shared/device-rail'

const device: RailDevice = {id:'', name:'시험기', host:'localhost', port:22, service:{kind:'tcp',port:8080},
  favorite:true, description:'', location:'연구실', macros:[{id:'restart',name:'확인',commands:'pwd\nls'}]}
let profile: string
let store: DeviceStore
beforeEach(() => {
  profile = mkdtempSync(join(tmpdir(), 'workrail-devices-'))
  store = new DeviceStore(profile)
})
afterEach(() => { store.close(); rmSync(profile,{recursive:true, force:true}) })

it('persists a device and its own editable macros atomically across a restart', () => {
  const saved = store.save(device)
  expect(saved.id).toBeTruthy()
  store.close()
  store = new DeviceStore(profile)
  expect(store.read()).toEqual([saved])
  expect(() => store.save({...saved, name:'변경', macros:[...saved.macros,...saved.macros]})).toThrow()
  expect(store.read()).toEqual([saved])
  store.save({...saved, favorite:false, macros:[]})
  expect(store.read()[0]).toMatchObject({favorite:false,macros:[]})
  store.remove(saved.id)
  expect(store.read()).toEqual([])
  expect(() => store.save(saved)).toThrow()
})

it.each([{port:0},{host:'http://localhost'},{favorite:'true'},{alertsEnabled:1},{service:{kind:'tcp',port:65536}},
  {service:{kind:'http',url:'file:///etc/passwd'}},{service:{kind:'http',url:'http://me:pass@localhost/'}}])(
  'validates a registration before storing it %j', invalid => {
    expect(() => store.save({...device,...invalid})).toThrow()
    expect(store.read()).toEqual([])
  })

it('leaves an unreadable local device database intact', () => {
  store.close()
  const file = join(profile, 'devicerail.sqlite')
  const invalid = Buffer.from('손상된 시험 데이터')
  writeFileSync(file, invalid)
  expect(() => new DeviceStore(profile)).toThrow()
  expect(readFileSync(file)).toEqual(invalid)
})

const failed = {ok:false, detail:'연결에 실패했습니다.'}
const healthy = {ok:true, detail:'연결 성공'}
const bothFailed = {ssh:failed, service:failed}

it('migrates existing registrations to alerts off without losing macros', () => {
  store.close()
  const file = join(profile, 'devicerail.sqlite')
  rmSync(file)
  const legacy = new DatabaseSync(file)
  legacy.exec('CREATE TABLE devices (id TEXT PRIMARY KEY, definition TEXT NOT NULL) STRICT; PRAGMA user_version = 1')
  const previous = {...device, id:'legacy-device'}
  legacy.prepare('INSERT INTO devices VALUES (?, ?)').run(previous.id, JSON.stringify(previous))
  legacy.close()

  store = new DeviceStore(profile)
  expect(store.read()).toEqual([{...previous, alertsEnabled:false}])
  expect(store.recordObservations(previous.id, bothFailed, true)).toEqual([])
  expect(store.recordObservations(previous.id, bothFailed, true)).toEqual([])
  expect(store.save(device).alertsEnabled).toBe(false)
  store.save({...previous, alertsEnabled:true})
  expect(store.recordObservations(previous.id, bothFailed, true)).toEqual([])
  expect(store.recordObservations(previous.id, bothFailed, true)).toEqual(['ssh','service'])
})

it('persists each axis streak and claim through restart until that axis recovers', () => {
  const {id} = store.save({...device, alertsEnabled:true})
  expect(store.recordObservations(id, {ssh:failed, service:healthy}, true)).toEqual([])
  expect(store.recordObservations(id, {ssh:healthy, service:failed}, true)).toEqual([])
  expect(store.recordObservations(id, bothFailed, true)).toEqual(['service'])
  store.close()
  store = new DeviceStore(profile)
  expect(store.recordObservations(id, bothFailed, true)).toEqual(['ssh'])
  expect(store.recordObservations(id, bothFailed, true)).toEqual([])
  expect(store.recordObservations(id, {service:healthy}, true)).toEqual([])
  expect(store.recordObservations(id, bothFailed, true)).toEqual([])
  expect(store.recordObservations(id, bothFailed, true)).toEqual(['service'])
})

it('claims only observed ongoing failures after global mute ends', () => {
  const {id} = store.save({...device, alertsEnabled:true})
  expect(store.recordObservations(id, bothFailed, false)).toEqual([])
  expect(store.recordObservations(id, bothFailed, false)).toEqual([])
  expect(store.recordObservations(id, {ssh:healthy}, false)).toEqual([])
  expect(store.recordObservations(id, {ssh:failed}, true)).toEqual([])
  expect(store.recordObservations(id, {service:failed}, true)).toEqual(['service'])
})

it('starts fresh when enabling after an opt-out and ignores observations after deletion', () => {
  const saved = store.save({...device, alertsEnabled:true})
  expect(store.recordObservations(saved.id, bothFailed, true)).toEqual([])
  store.save({...saved, alertsEnabled:false})
  expect(store.recordObservations(saved.id, bothFailed, true)).toEqual([])
  store.save(saved)
  expect(store.recordObservations(saved.id, bothFailed, true)).toEqual([])
  expect(store.recordObservations(saved.id, bothFailed, true)).toEqual(['ssh','service'])
  store.remove(saved.id)
  expect(store.recordObservations(saved.id, bothFailed, true)).toEqual([])
})

it('preserves claims across metadata edits and resets only the changed probe target', () => {
  const saved = store.save({...device, alertsEnabled:true})
  const check = () => store.recordObservations(saved.id, bothFailed, true)
  expect(check()).toEqual([])
  expect(check()).toEqual(['ssh','service'])
  store.save({...saved, name:'수정', favorite:false})
  expect(check()).toEqual([])
  const http = store.save({...saved, service:{kind:'http', url:'https://localhost/status'}})
  expect(check()).toEqual([])
  expect(check()).toEqual(['service'])
  store.save({...http, host:'example.org'})
  expect(check()).toEqual([])
  expect(check()).toEqual(['ssh'])
  store.save({...http, service:{kind:'none'}})
  expect(check()).toEqual([])
  expect(check()).toEqual(['ssh'])
  expect(check()).toEqual([])
})

it('resets the TCP service on a host change but preserves it on an SSH port change', () => {
  const saved = store.save({...device, alertsEnabled:true})
  const check = () => store.recordObservations(saved.id, bothFailed, true)
  expect(check()).toEqual([])
  store.save({...saved, host:'example.org'})
  expect(check()).toEqual([])
  expect(check()).toEqual(['ssh','service'])
  store.save({...saved, host:'example.org', port:23})
  expect(check()).toEqual([])
  expect(check()).toEqual(['ssh'])
})

it('retries definite send failures without releasing claims for newer incidents', () => {
  const {id} = store.save({...device, alertsEnabled:true})
  expect(store.recordObservations(id, bothFailed, true)).toEqual([])
  expect(store.recordObservations(id, bothFailed, true, 'first')).toEqual(['ssh','service'])
  expect(store.recordObservations(id, {ssh:healthy}, true)).toEqual([])
  expect(store.recordObservations(id, {ssh:failed}, true)).toEqual([])
  expect(store.recordObservations(id, {ssh:failed}, true, 'second')).toEqual(['ssh'])
  store.releaseAlertClaim(id, 'first')
  expect(store.recordObservations(id, bothFailed, true, 'third')).toEqual(['service'])
  store.releaseAlertClaim(id, 'first')
  expect(store.recordObservations(id, bothFailed, true)).toEqual([])
})
