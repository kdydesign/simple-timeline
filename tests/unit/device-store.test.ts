import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
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

it.each([{port:0},{host:'http://localhost'},{favorite:'true'},{service:{kind:'tcp',port:65536}},
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
